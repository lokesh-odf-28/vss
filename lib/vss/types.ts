// Wire types for the VSS / LVS / RTVI APIs.
// Extracted from services/video-summarization/api_spec/openapi.json and
// services/rtvi/rt-vlm's own API models — do not invent fields here; check
// the spec before adding. Field names are kept as the wire format (snake_case)
// rather than mapped to camelCase, matching how the rest of this file works.

export type CompletionObject =
  | 'chat.completion'
  | 'summarization.completion'
  | 'summarization.progressing'   // /v1/summarize only — stream_summarize never emits this
  | 'vlm_captions.completion'
  | 'vlm_captions.progressing';

// ── recorded: POST /v1/summarize ────────────────────────────────────────

export interface SummarizeRequest {
  id: string;                 // VST video/sensor id
  prompt?: string;
  system_prompt?: string;
  model?: string;
  scenario?: string;
  events?: string[];          // NOT event_types — confirmed against SummarizationQuery in the spec
  objects_of_interest?: string[];
}

export interface CompletionResponseMessage {
  role: string;
  content: string;
}

export interface CompletionResponseChoice {
  index: number;
  finish_reason: string | null;
  message: CompletionResponseMessage;
}

export interface MediaInfo {
  type: string;
  start_offset?: number;
  end_offset?: number;
}

export interface CompletionResponse {
  id: string;
  video_id: string;
  created: number;
  model: string;
  object: CompletionObject;
  media_info: MediaInfo | null;
  choices: CompletionResponseChoice[];
  usage?: unknown;
}

export interface LvsError {
  code: string;
  message: string;
}

export function isProgressing(r: CompletionResponse): boolean {
  return r.object.endsWith('.progressing');
}

/**
 * A detection as VSS reports it — no severity, because severity is authored
 * by the user in C2 and looked up from the use case, not invented by the
 * model. No id/runId either; those are assigned when it is persisted.
 */
export interface IncidentDraft {
  offsetMs: number;
  eventCode: string;
  description: string;
  objectIds: string[];
}

// ── live: RTVI stream registration ──────────────────────────────────────
// A DIFFERENT service from LVS — its own base URL (RTVI_URL), no auth
// assumptions carried over. See services/rtvi/rt-vlm.

export interface StreamAddRequest {
  key: string;
  value: {
    camera_id: string;
    camera_name?: string;
    camera_url: string;      // rtsp://...
    change: 'camera_add';
    creation_time?: string;
    // Deliberately no `prompt` here, ever — setting one makes RTVI
    // auto-start inference with a raw prompt, bypassing the
    // scenario/events/objects_of_interest path entirely. Keep passthrough.
  };
}

export interface StreamAddResponse {
  camera_id: string;
  asset_id: string;          // this becomes `id` on every LVS live call below
  status: 'processing' | 'added';
}

// ── live: LVS captioning + summarization ────────────────────────────────

export interface GenerateCaptionsRequest {
  id: string;                 // = asset_id from RTVI stream/add
  model?: string;
  prompt?: string;
  system_prompt?: string;
  scenario?: string;
  events?: string[];
  objects_of_interest?: string[];
  override_vlm_prompt?: boolean;
}

export interface GenerateCaptionsResponse {
  id: string;
  status: string;             // "accepted"
  model: string;
}

export interface StreamSummarizeRequest {
  id: string;                 // = asset_id
  model?: string;
  start_time?: number;        // seconds, NOT ISO-8601 — the README example is wrong, trust the schema
  end_time?: number;
}

export interface VssClient {
  health(): Promise<{ ok: boolean; detail: string }>;

  // recorded
  summarize(req: SummarizeRequest): Promise<CompletionResponse>;
  /** Poll an in-flight job. Returns the same shape as summarize(). */
  poll(jobId: string): Promise<CompletionResponse>;
  /** Detections for a finished job. Called once, when the run completes. */
  detectedIncidents(jobId: string): Promise<IncidentDraft[]>;

  // live — three real service calls behind one interface. Callers never
  // need to know RTVI and LVS are different base URLs; see client.ts.
  /** Registers the camera with RTVI. Returns the id every later call needs. */
  startLiveStream(req: StreamAddRequest): Promise<StreamAddResponse>;
  /** Fire-and-forget: tells LVS to start captioning the registered stream. */
  startCaptioning(req: GenerateCaptionsRequest): Promise<GenerateCaptionsResponse>;
  /** Blocking — each call returns one aggregated summary of what has
   * happened so far. There is no push notification; the caller polls this
   * on its own timer. */
  streamSummarize(req: StreamSummarizeRequest): Promise<CompletionResponse>;
  /** Tears down the RTSP pipeline. No LVS-side stop call exists. */
  stopLiveStream(streamId: string): Promise<void>;
}
