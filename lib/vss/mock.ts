import type {
  VssClient, SummarizeRequest, CompletionResponse, IncidentDraft,
  StreamAddRequest, StreamAddResponse, GenerateCaptionsRequest, GenerateCaptionsResponse,
  StreamSummarizeRequest,
} from './types';

/**
 * Mock LVS + mock RTVI, in one module.
 *
 * Recorded jobs "finish" after MOCK_JOB_SECONDS — see the existing
 * `summarize`/`poll` pair below, unchanged apart from the events rename.
 *
 * Live sessions simulate the real three-call dance (stream/add → LVS
 * generate_captions → repeated stream_summarize → stop) closely enough that
 * C4b can be built and tested against it with zero real infra — RTVI and
 * Alert Bridge are both real, separately-deployed services neither of which
 * exist yet. Each poll of a live session returns a summary that visibly
 * grows with elapsed time, so a UI built against this can actually be seen
 * to update rather than just not-crash.
 */
const MOCK_JOB_SECONDS = Number(process.env.MOCK_JOB_SECONDS ?? 20);

// ── recorded ─────────────────────────────────────────────────────────────

const jobs = new Map<string, {
  startedAt: number; videoId: string; prompt: string; incidents: IncidentDraft[];
}>();

const CANNED_SUMMARY = `Across the analysed footage, three high-severity events occurred, all between 06:40 and 09:05. Two involved a forklift operating within 1.5 m of an unprotected worker near Bay 4. Pallet stacking obstructed emergency exit E2 for approximately 22 minutes. PPE compliance was otherwise consistent throughout the shift.`;

function response(jobId: string, videoId: string, done: boolean): CompletionResponse {
  return {
    id: jobId,
    video_id: videoId,
    created: Math.floor(Date.now() / 1000),
    model: 'mock-vlm',
    object: done ? 'summarization.completion' : 'summarization.progressing',
    media_info: { type: 'offset', start_offset: 0, end_offset: 28800 },
    choices: [
      {
        index: 0,
        finish_reason: done ? 'stop' : null,
        message: { role: 'assistant', content: done ? CANNED_SUMMARY : '' },
      },
    ],
  };
}

/**
 * Build plausible detections from whatever events the use case declared, so
 * Warehouse Safety and Sport produce visibly different results rather than
 * one hardcoded list. Deterministic per job: generated once at submit time.
 */
function generateIncidents(req: SummarizeRequest): IncidentDraft[] {
  const codes = req.events ?? [];
  if (codes.length === 0) return [];

  const objects = req.objects_of_interest ?? [];
  const durationMs = 8 * 60 * 60 * 1000;          // matches media_info end_offset
  const count = Math.min(codes.length + 1, 5);

  return Array.from({ length: count }, (_, i) => {
    const code = codes[i % codes.length];
    const readable = code.replace(/_/g, ' ');
    return {
      offsetMs: Math.round(((i + 1) / (count + 1)) * durationMs),
      eventCode: code,
      description:
        `Detected ${readable}` +
        (objects.length ? ` involving ${objects[i % objects.length]}` : '') + '.',
      objectIds: [`obj-${100 + i * 7}`],
    };
  }).sort((a, b) => a.offsetMs - b.offsetMs);
}

// ── live ─────────────────────────────────────────────────────────────────

interface LiveStream {
  streamId: string;
  cameraId: string;
  cameraUrl: string;
  captioning: boolean;
  scenario?: string;
  events: string[];
  objects: string[];
  captioningStartedAt: number;
  stopped: boolean;
}

const liveStreams = new Map<string, LiveStream>();

function liveSummaryText(stream: LiveStream, elapsedSec: number): string {
  const minutes = Math.max(1, Math.round(elapsedSec / 60));
  if (stream.events.length === 0) {
    return `No activity observed in the last ${minutes} minute(s).`;
  }
  // Rotates through the declared events so a longer session visibly
  // accumulates more than a static one-liner.
  const seen = stream.events.slice(0, Math.min(stream.events.length, 1 + Math.floor(elapsedSec / 30)));
  const lines = seen.map((code, i) => {
    const readable = code.replace(/_/g, ' ');
    const obj = stream.objects[i % Math.max(stream.objects.length, 1)];
    return `- ${readable}${obj ? ` involving ${obj}` : ''}, ~${Math.max(1, minutes - i)}m ago`;
  });
  return `Live activity in the last ${minutes} minute(s):\n${lines.join('\n')}`;
}

export const mockClient: VssClient = {
  async health() {
    return { ok: true, detail: 'mock VSS — set USE_MOCK_VSS=false to hit a real deployment' };
  },

  // ── recorded ───────────────────────────────────────────────────────────

  async summarize(req: SummarizeRequest) {
    const jobId = `mock-${Math.random().toString(36).slice(2, 10)}`;
    jobs.set(jobId, {
      startedAt: Date.now(),
      videoId: req.id,
      prompt: req.prompt ?? '',
      incidents: generateIncidents(req),
    });
    // LVS accepts the job and returns immediately — it does not block.
    return response(jobId, req.id, false);
  },

  async poll(jobId: string) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`unknown job ${jobId}`);
    const elapsed = (Date.now() - job.startedAt) / 1000;
    return response(jobId, job.videoId, elapsed >= MOCK_JOB_SECONDS);
  },

  async detectedIncidents(jobId: string) {
    return jobs.get(jobId)?.incidents ?? [];
  },

  // ── live ───────────────────────────────────────────────────────────────

  async startLiveStream(req: StreamAddRequest): Promise<StreamAddResponse> {
    const streamId = `mock-stream-${Math.random().toString(36).slice(2, 10)}`;
    liveStreams.set(streamId, {
      streamId,
      cameraId: req.value.camera_id,
      cameraUrl: req.value.camera_url,
      captioning: false,
      events: [],
      objects: [],
      captioningStartedAt: 0,
      stopped: false,
    });
    return { camera_id: req.value.camera_id, asset_id: streamId, status: 'added' };
  },

  async startCaptioning(req: GenerateCaptionsRequest): Promise<GenerateCaptionsResponse> {
    const stream = liveStreams.get(req.id);
    if (!stream) throw new Error(`unknown stream ${req.id} — call startLiveStream first`);
    stream.captioning = true;
    stream.captioningStartedAt = Date.now();
    stream.scenario = req.scenario;
    stream.events = req.events ?? [];
    stream.objects = req.objects_of_interest ?? [];
    return { id: req.id, status: 'accepted', model: req.model ?? 'mock-vlm' };
  },

  async streamSummarize(req: StreamSummarizeRequest): Promise<CompletionResponse> {
    const stream = liveStreams.get(req.id);
    if (!stream) throw new Error(`unknown stream ${req.id}`);
    if (stream.stopped) throw new Error(`stream ${req.id} has been stopped`);
    if (!stream.captioning) throw new Error(`stream ${req.id} — captioning was never started`);

    // Real stream_summarize BLOCKS until CA-RAG aggregates — simulated here
    // as a short, deliberate delay so a UI that does not show its own
    // "summarizing…" state per poll will visibly feel wrong, same as it
    // would against the real thing.
    await new Promise((r) => setTimeout(r, 400));

    const elapsedSec = (Date.now() - stream.captioningStartedAt) / 1000;
    return {
      id: `mock-summary-${Math.random().toString(36).slice(2, 8)}`,
      video_id: stream.streamId,
      created: Math.floor(Date.now() / 1000),
      model: 'mock-vlm',
      object: 'summarization.completion', // stream_summarize never emits .progressing — confirmed against via_server.py
      media_info: null,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: liveSummaryText(stream, elapsedSec) },
      }],
    };
  },

  async stopLiveStream(streamId: string): Promise<void> {
    const stream = liveStreams.get(streamId);
    if (stream) stream.stopped = true;
  },
};

/** 0–100, derived from elapsed time. Drives the analysis bar on C4a (recorded only). */
export function mockProgress(jobId: string): number {
  const job = jobs.get(jobId);
  if (!job) return 0;
  const elapsed = (Date.now() - job.startedAt) / 1000;
  return Math.min(100, Math.round((elapsed / MOCK_JOB_SECONDS) * 100));
}
