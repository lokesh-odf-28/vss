import type {
  VssClient, SummarizeRequest, CompletionResponse, LvsError,
} from './types';

/**
 * Real LVS client. Talks to the deployed VSS stack.
 *
 * Runs SERVER-SIDE ONLY — it carries API keys and must never be imported into
 * a client component. Video upload does NOT go through here: the browser
 * uploads chunks straight to VST (see design doc §"upload exception").
 */
const BASE = process.env.LVS_URL ?? 'http://localhost:38111';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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
    throw new Error(`LVS ${res.status} [${err.code}] ${err.message}`);
  }
  return res.json() as Promise<T>;
}

export const realClient: VssClient = {
  async health() {
    try {
      await call('/v1/ready');
      return { ok: true, detail: `LVS reachable at ${BASE}` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },

  summarize(req: SummarizeRequest) {
    return call<CompletionResponse>('/v1/summarize', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  // TODO: confirm the polling endpoint against your deployment. LVS also
  // supports SSE streaming on /v1/summarize; if you use that instead, replace
  // this with an EventSource consumer in the route handler.
  poll(jobId: string) {
    return call<CompletionResponse>(`/v1/summarize/${jobId}`);
  },

  // Real VSS does not hand back a structured incident list — detections have
  // to be extracted from the per-chunk captions (/v1/generate_captions) or
  // read out of Elasticsearch, which the LVS stack writes to. Returning empty
  // means a real run completes with a summary and no timeline, which is
  // honest; it does not invent detections that were never reported.
  async detectedIncidents(_jobId: string) {
    return [];
  },
};
