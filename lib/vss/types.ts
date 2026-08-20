// Wire types for the VSS / LVS API.
// Extracted from services/video-summarization/api_spec/openapi.json — do not
// invent fields here; check the spec before adding.

export type CompletionObject =
  | 'chat.completion'
  | 'summarization.completion'
  | 'summarization.progressing'   // still working — this is how async is signalled
  | 'vlm_captions.completion'
  | 'vlm_captions.progressing';

export interface SummarizeRequest {
  id: string;                 // VST video/sensor id
  prompt?: string;
  system_prompt?: string;
  model?: string;
  /** Live only — structured scene description */
  scenario?: string;
  event_types?: string[];
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

export interface VssClient {
  health(): Promise<{ ok: boolean; detail: string }>;
  summarize(req: SummarizeRequest): Promise<CompletionResponse>;
  /** Poll an in-flight job. Returns the same shape as summarize(). */
  poll(jobId: string): Promise<CompletionResponse>;
}
