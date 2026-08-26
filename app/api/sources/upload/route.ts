import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSource } from '@/lib/store';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { vssMode } from '@/lib/vss';

export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.join(process.cwd(), '.uploads');
const MAX_BYTES = 200 * 1024 * 1024; // 200MB — a sanity cap, not a real limit; this buffers the whole file in memory.

/**
 * Real file upload — only meaningful in nvidia-hosted mode, where there's an
 * actual file on disk for lib/vss/nvidiaHosted.ts to extract frames from.
 * In mock/real-VSS mode, sources register from a filename only (see
 * app/api/sources/route.ts) — real VST upload is a browser-to-VST direct
 * path that isn't built. This route is the deliberate, scoped exception to
 * that rule for local testing with just an NVIDIA API key.
 */
export async function POST(req: Request) {
  if (vssMode !== 'nvidia-hosted') {
    return NextResponse.json(
      { error: 'Real file upload only applies in nvidia-hosted mode (NEXT_PUBLIC_VSS_MODE=nvidia-hosted)' },
      { status: 400 },
    );
  }

  let ctx;
  try {
    ctx = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }

  const form = await req.formData();
  const file = form.get('file');
  const name = form.get('name');
  if (!(file instanceof Blob) || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'file and name are required' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `file exceeds the ${MAX_BYTES / 1024 / 1024}MB local-testing cap` }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(name) || '.mp4';
  const filePath = path.join(UPLOAD_DIR, `${randomUUID()}${ext}`);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  const source = await createSource(ctx.orgId, name, filePath);
  return NextResponse.json({ data: source }, { status: 201 });
}
