import type {
  VssClient, SummarizeRequest, CompletionResponse,
} from './types';

/**
 * Mock LVS. Returns the real CompletionResponse shape, including the
 * `summarization.progressing` → `summarization.completion` transition, so the
 * two-phase progress UI (C4a) can be built and tested before any GPU exists.
 *
 * Jobs "finish" after MOCK_JOB_SECONDS.
 */
const MOCK_JOB_SECONDS = Number(process.env.MOCK_JOB_SECONDS ?? 20);

const jobs = new Map<string, { startedAt: number; videoId: string; prompt: string }>();

const CANNED_SUMMARY = `Across the analysed footage, three high-severity events occurred, all between 06:40 and 09:05. Two involved a forklift operating within 1.5 m of an unprotected worker near Bay 4. Pallet stacking obstructed emergency exit E2 for approximately 22 minutes. PPE compliance was otherwise consistent throughout the shift.`;

function response(
  jobId: string, videoId: string, done: boolean,
): CompletionResponse {
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

export const mockClient: VssClient = {
  async health() {
    return { ok: true, detail: 'mock VSS — set USE_MOCK_VSS=false to hit a real deployment' };
  },

  async summarize(req: SummarizeRequest) {
    const jobId = `mock-${Math.random().toString(36).slice(2, 10)}`;
    jobs.set(jobId, {
      startedAt: Date.now(),
      videoId: req.id,
      prompt: req.prompt ?? '',
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
};

/** 0–100, derived from elapsed time. Drives the analysis bar on C4a. */
export function mockProgress(jobId: string): number {
  const job = jobs.get(jobId);
  if (!job) return 0;
  const elapsed = (Date.now() - job.startedAt) / 1000;
  return Math.min(100, Math.round((elapsed / MOCK_JOB_SECONDS) * 100));
}
