import type {
  VssClient, SummarizeRequest, CompletionResponse, LvsError,
  StreamAddRequest, StreamAddResponse, GenerateCaptionsRequest, GenerateCaptionsResponse,
  StreamSummarizeRequest,
} from './types';
import { buildJsonSchema, extractStructured } from './structuredOutput';

/**
 * Real VSS client — LVS for recorded/live summarization, RTVI for live
 * stream registration. Two different services, two different base URLs;
 * hidden behind one VssClient interface so nothing outside this file needs
 * to know that split exists.
 *
 * Runs SERVER-SIDE ONLY — it carries API keys and must never be imported into
 * a client component. Video upload does NOT go through here: the browser
 * uploads chunks straight to VST (see design doc §"upload exception").
 */
const LVS_BASE = process.env.LVS_URL ?? 'http://localhost:38111';
const RTVI_BASE = process.env.RTVI_URL ?? 'http://localhost:8100';

async function call<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.NVIDIA_API_KEY
        ? { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` }
        : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let err: LvsError = { code: String(res.status), message: res.statusText };
    try { err = await res.json(); } catch { /* non-JSON error body */ }
    // 503 is a real, expected state: "server busy processing another file".
    throw new Error(`${base} ${res.status} [${err.code}] ${err.message}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const lvs = <T>(path: string, init?: RequestInit) => call<T>(LVS_BASE, path, init);
const rtvi = <T>(path: string, init?: RequestInit) => call<T>(RTVI_BASE, path, init);

export const realClient: VssClient = {
  async health() {
    try {
      await lvs('/v1/ready');
      return { ok: true, detail: `LVS reachable at ${LVS_BASE}` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },

  // ── recorded ───────────────────────────────────────────────────────────

  /**
   * UNVERIFIED against a live deployment — built from
   * services/video-summarization/api_spec/openapi.json's documented fields,
   * not confirmed against a running LVS. `auto_generate_prompt: false` +
   * `override_vlm_prompt: true` matter here: without them, VSS may replace
   * the use case's authored prompt/system_prompt with one it generates from
   * `schema`/`events` itself — structured output should not come at the
   * cost of the prompt the user actually wrote in C2.
   */
  summarize(req: SummarizeRequest) {
    return lvs<CompletionResponse>('/v1/summarize', {
      method: 'POST',
      body: JSON.stringify({
        ...req,
        schema: buildJsonSchema(req.events ?? []),
        enable_vlm_structured_output: true,
        auto_generate_prompt: false,
        override_vlm_prompt: true,
      }),
    });
  },

  // TODO: confirm the polling endpoint against your deployment. LVS also
  // supports SSE streaming on /v1/summarize; if you use that instead, replace
  // this with an EventSource consumer in the route handler.
  //
  // content is cleaned here (structured JSON in, prose out) so callers of
  // poll() never see raw JSON where they expect a readable summary —
  // detectedIncidents() below does the same parse to get the event list.
  async poll(jobId: string) {
    const res = await lvs<CompletionResponse>(`/v1/summarize/${jobId}`);
    const raw = res.choices[0]?.message?.content;
    if (!raw || res.object !== 'summarization.completion') return res;
    const { summary } = extractStructured(raw);
    return { ...res, choices: [{ ...res.choices[0], message: { ...res.choices[0].message, content: summary } }] };
  },

  /**
   * Re-fetches and re-parses the same completed job poll() already read —
   * an extra round trip, not a cache, because this path has no request-time
   * job map to stash a parsed result in (unlike nvidiaHosted.ts). Fine for
   * now: this only runs once per completed run. Worth a short-lived cache
   * if this ever shows up in profiling against a real deployment.
   */
  async detectedIncidents(jobId: string) {
    const res = await lvs<CompletionResponse>(`/v1/summarize/${jobId}`);
    const raw = res.choices[0]?.message?.content;
    if (!raw) return [];
    return extractStructured(raw).events;
  },

  // ── live ───────────────────────────────────────────────────────────────
  // Order matters and is not our choice — it is how RTVI/LVS are wired:
  // register with RTVI first (get an asset_id), THEN tell LVS to caption it.
  // See services/rtvi/rt-vlm and services/video-summarization/via_server.py
  // on the VSS side for why.

  startLiveStream(req: StreamAddRequest) {
    return rtvi<StreamAddResponse>('/v1/stream/add', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  startCaptioning(req: GenerateCaptionsRequest) {
    // Requires KAFKA_ENABLED=true on the LVS deployment or this 400s —
    // that is a real deployment prerequisite, not a bug here if it fails.
    return lvs<GenerateCaptionsResponse>('/v1/generate_captions', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  // Blocks server-side until CA-RAG aggregates — can take several seconds.
  // The caller is responsible for polling this on its own timer; there is no
  // push notification for "new captions arrived".
  streamSummarize(req: StreamSummarizeRequest) {
    return lvs<CompletionResponse>('/v1/stream_summarize', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  // No stop call exists on LVS at all — stopping is entirely an RTVI
  // operation that tears down the RTSP pipeline.
  async stopLiveStream(streamId: string) {
    await rtvi<void>(`/v1/generate_captions/${streamId}`, { method: 'DELETE' });
  },
};
