#!/usr/bin/env python3
"""
Sanity-check a structured prompt against a REAL NVIDIA-hosted VLM, without
deploying any part of VSS.

This talks directly to NVIDIA's API catalog (https://integrate.api.nvidia.com)
using the same model (nvidia/cosmos3-nano-reasoner) and the same request shape
VSS itself uses when configured for the hosted-endpoint profile — see
video-search-and-summarization/deploy/helm/developer-profiles/dev-profile-search/
values-build-endpoint.yaml and services/agent/src/vss_agents/tools/
video_understanding.py (_build_vlm_messages, use_base64 path for cosmos models).

That path samples frames from the video and sends them as base64 JPEG images
in a single chat message — it does not upload the raw video file. This script
does the same with ffmpeg instead of VSS's frame_select().

This is deliberately NOT part of the running app: it doesn't touch Postgres,
lib/store, or lib/vss. It exists only to answer "what would a real model
actually say for this prompt" while a full VSS deployment isn't available.

Requirements:
  - ffmpeg on PATH (brew install ffmpeg)
  - NVIDIA_API_KEY in your environment (from https://build.nvidia.com/ —
    never pass it on the command line or paste it into a file this script
    reads from; export it in your shell before running)

Usage:
  export NVIDIA_API_KEY=nvapi-...
  python3 /Users/Lokesh/Documents/vss/video-intelligence/scripts/vlm-sanity-check.py --video /Users/Lokesh/Documents/vss/video-intelligence/clip.mp4


  # override the prompts (defaults below match the Warehouse Safety use case)
  python3 scripts/vlm-sanity-check.py --video clip.mp4 \\
      --prompt "Describe any safety violations." \\
      --system-prompt "You are a warehouse safety inspector."
"""
import argparse
import base64
import json
import os
import shutil
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

# python.org's macOS build of Python doesn't link the system CA store, so a
# fresh install fails every HTTPS request with CERTIFICATE_VERIFY_FAILED
# until "Install Certificates.command" is run once. Using certifi's bundle
# directly sidesteps that instead of depending on a separate manual step.
try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CONTEXT = None

API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
# cosmos3-nano-reasoner (VSS's own default) isn't exposed on the public API
# catalog for every account — confirm what's actually available with:
#   curl -s https://integrate.api.nvidia.com/v1/models \
#     -H "Authorization: Bearer $NVIDIA_API_KEY" | python3 -m json.tool | grep -i cosmos
# nemotron-nano-12b-v2-vl is a real vision-language model and was confirmed
# present. Override with --model if you find cosmos or another VLM available.
MODEL = "nvidia/nemotron-nano-12b-v2-vl"

DEFAULT_SYSTEM_PROMPT = (
    "You are a warehouse safety inspector reviewing recorded CCTV footage. "
    "Identify only genuine safety violations and hazards — do not report "
    "routine, expected warehouse activity. For every event, state what "
    "happened, who or what was involved, and roughly when it occurred. Be "
    "specific and factual; do not speculate about intent. If nothing unsafe "
    "occurred, say so plainly rather than inventing an event."
)
DEFAULT_PROMPT = (
    "Review this footage for: forklift proximity violations, blocked "
    "emergency exits, unauthorized access to restricted zones, missing PPE, "
    "spill hazards, and unsafe pallet stacking. For each occurrence, "
    "describe the event, its approximate time, and the risk it poses. "
    "Summarize overall floor safety at the end."
)


def probe_duration_seconds(video_path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def extract_frames_b64(video_path: str, num_frames: int, tmpdir: str) -> list[str]:
    duration = probe_duration_seconds(video_path)
    if duration <= 0:
        raise RuntimeError(f"ffprobe reported a non-positive duration ({duration}s) for {video_path}")

    step = duration / (num_frames + 1)
    frames = []
    for i in range(1, num_frames + 1):
        ts = step * i
        frame_path = os.path.join(tmpdir, f"frame_{i:02d}.jpg")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(ts), "-i", video_path,
             "-frames:v", "1", "-q:v", "2", frame_path],
            check=True,
        )
        with open(frame_path, "rb") as f:
            frames.append(base64.b64encode(f.read()).decode("ascii"))
    return frames


def call_vlm(api_key: str, model: str, system_prompt: str, user_prompt: str, frames_b64: list[str], timeout: int) -> dict:
    content = [
        {
            "type": "text",
            "text": f"The following images are a sequence of frames from a video. Answer the user's question based on the video: {user_prompt}",
        },
        *[{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{f}"}} for f in frames_b64],
    ]
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ],
        "temperature": 0.2,
        "max_tokens": 1024,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CONTEXT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"NVIDIA API returned {e.code}: {detail}") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--video", required=True, help="Path to a local video file")
    parser.add_argument("--model", default=MODEL, help=f"NVIDIA API catalog model id (default {MODEL})")
    parser.add_argument("--frames", type=int, default=6, help="Number of frames to sample (default 6)")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT, help="User/task prompt")
    parser.add_argument("--system-prompt", default=DEFAULT_SYSTEM_PROMPT, help="System prompt")
    parser.add_argument("--timeout", type=int, default=300,
                         help="Seconds to wait for the model response (default 300 — multi-image "
                              "vision requests can be slow, especially on a cold-started endpoint)")
    args = parser.parse_args()

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        print("ffmpeg/ffprobe not found. Install with: brew install ffmpeg", file=sys.stderr)
        sys.exit(1)

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        print("NVIDIA_API_KEY is not set. Get one at https://build.nvidia.com/ and:\n"
              "  export NVIDIA_API_KEY=nvapi-...", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(args.video):
        print(f"No such file: {args.video}", file=sys.stderr)
        sys.exit(1)

    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"Sampling {args.frames} frames from {args.video} ...", file=sys.stderr)
        frames_b64 = extract_frames_b64(args.video, args.frames, tmpdir)

        print(f"Calling {args.model} at {API_URL} ...", file=sys.stderr)
        result = call_vlm(api_key, args.model, args.system_prompt, args.prompt, frames_b64, args.timeout)

    choice = (result.get("choices") or [{}])[0]
    content = choice.get("message", {}).get("content", "")
    print("\n=== Model response ===\n")
    print(content)
    print("\n=== Raw usage ===")
    print(json.dumps(result.get("usage", {}), indent=2))


if __name__ == "__main__":
    main()
