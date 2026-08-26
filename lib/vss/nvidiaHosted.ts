import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  VssClient, SummarizeRequest, CompletionResponse,
  StreamAddResponse, GenerateCaptionsResponse,
} from './types';

/**
 * Calls a real NVIDIA-hosted VLM directly (integrate.api.nvidia.com),
 * bypassing VSS entirely — real model output with just an NVIDIA API key,
 * no VSS deployment. Mirrors scripts/vlm-sanity-check.py: sample frames
 * with ffmpeg, send as base64 images in one chat completion.
 *
 * Unlike real LVS, this is one blocking call, not an async job. summarize()
 * kicks off the real work in the background (so the route awaiting it
 * returns quickly) and poll() reports progress from a job map — same shape
 * as lib/vss/mock.ts's jobs map, so nothing above this file needs to know
 * the difference between mock, this, and real LVS.
 *
 * Live mode is out of scope here — NVIDIA's hosted API doesn't do live
 * camera streams, only chat completions on frames you send it.
 */

const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = process.env.NVIDIA_VLM_MODEL ?? 'nvidia/nemotron-nano-12b-v2-vl';
const NUM_FRAMES = Number(process.env.NVIDIA_VLM_FRAMES ?? 3);
const REQUEST_TIMEOUT_MS = 120_000;

type JobStatus = 'pending' | 'complete' | 'error';
interface Job {
  status: JobStatus;
  videoId: string;
  startedAt: number;
  content?: string;
  error?: string;
}

// globalThis-cached for the same reason lib/db.ts's pool and lib/vss/mock.ts's
// jobs map are: Next's dev server doesn't reliably share a module's
// top-level state between different route handler files.
declare global {
  // eslint-disable-next-line no-var
  var __vi_nvidia_jobs: Map<string, Job> | undefined;
}
const jobs = globalThis.__vi_nvidia_jobs ?? (globalThis.__vi_nvidia_jobs = new Map<string, Job>());

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => { stdout += d.toString(); });
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function extractFramesB64(videoPath: string, numFrames: number): Promise<string[]> {
  const durationStr = await runCapture('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', videoPath,
  ]);
  const duration = parseFloat(durationStr);
  if (!duration || duration <= 0) {
    throw new Error(`ffprobe reported a non-positive duration for ${videoPath}`);
  }

  const step = duration / (numFrames + 1);
  const tmp = await mkdtemp(path.join(tmpdir(), 'vi-frames-'));
  try {
    const frames: string[] = [];
    for (let i = 1; i <= numFrames; i++) {
      const ts = step * i;
      const framePath = path.join(tmp, `frame_${i}.jpg`);
      await run('ffmpeg', [
        '-y', '-loglevel', 'error', '-ss', String(ts), '-i', videoPath,
        '-frames:v', '1', '-q:v', '2', framePath,
      ]);
      frames.push((await readFile(framePath)).toString('base64'));
    }
    return frames;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function callVlm(systemPrompt: string, userPrompt: string, framesB64: string[]): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY is not set');

  const content = [
    {
      type: 'text',
      text: `The following images are a sequence of frames from a video. Answer the user's question based on the video: ${userPrompt}`,
    },
    ...framesB64.map((f) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${f}` } })),
  ];

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') {
      throw new Error(`NVIDIA API did not respond within ${REQUEST_TIMEOUT_MS / 1000}s — try again, or fewer frames (NVIDIA_VLM_FRAMES)`);
    }
    throw e;
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`NVIDIA API returned ${res.status}: ${detail.slice(0, 500)}`);
  }
  const body = await res.json();
  return body.choices?.[0]?.message?.content ?? '';
}

function response(jobId: string, videoId: string, done: boolean, content: string): CompletionResponse {
  return {
    id: jobId,
    video_id: videoId,
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    object: done ? 'summarization.completion' : 'summarization.progressing',
    media_info: { type: 'offset', start_offset: 0, end_offset: 0 },
    choices: [{ index: 0, finish_reason: done ? 'stop' : null, message: { role: 'assistant', content } }],
  };
}

export const nvidiaHostedClient: VssClient = {
  async health() {
    return {
      ok: Boolean(process.env.NVIDIA_API_KEY),
      detail: process.env.NVIDIA_API_KEY
        ? 'nvidia-hosted — calling integrate.api.nvidia.com directly, no VSS deployment'
        : 'NVIDIA_API_KEY is not set',
    };
  },

  // req.id is a real local file path here (see app/api/sources/upload/route.ts),
  // not a VST sensor id — this mode has no VST.
  async summarize(req: SummarizeRequest) {
    const jobId = `nvidia-${randomUUID()}`;
    jobs.set(jobId, { status: 'pending', videoId: req.id, startedAt: Date.now() });

    // Fire-and-forget: the route awaiting this only needs a job id back
    // quickly. The real work (frame extraction + a slow model call) keeps
    // running after this returns; poll() picks up the result later.
    void (async () => {
      const startedAt = jobs.get(jobId)!.startedAt;
      try {
        const frames = await extractFramesB64(req.id, NUM_FRAMES);
        const content = await callVlm(req.system_prompt ?? '', req.prompt ?? '', frames);
        jobs.set(jobId, { status: 'complete', videoId: req.id, startedAt, content });
      } catch (e) {
        jobs.set(jobId, { status: 'error', videoId: req.id, startedAt, error: (e as Error).message });
      }
    })();

    return response(jobId, req.id, false, '');
  },

  async poll(jobId: string) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`unknown job ${jobId}`);
    if (job.status === 'error') throw new Error(job.error);
    return response(jobId, job.videoId, job.status === 'complete', job.content ?? '');
  },

  async detectedIncidents() {
    // Free text in, free text out — no structured detections. Same honest
    // limitation as the real VSS client; see TECH-STACK.md §8.
    return [];
  },

  async startLiveStream(): Promise<StreamAddResponse> {
    throw new Error('live mode is not available in nvidia-hosted mode');
  },
  async startCaptioning(): Promise<GenerateCaptionsResponse> {
    throw new Error('live mode is not available in nvidia-hosted mode');
  },
  async streamSummarize(): Promise<CompletionResponse> {
    throw new Error('live mode is not available in nvidia-hosted mode');
  },
  async stopLiveStream(): Promise<void> {
    throw new Error('live mode is not available in nvidia-hosted mode');
  },
};
