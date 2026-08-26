import { mockClient } from './mock';
import { realClient } from './client';
import { nvidiaHostedClient } from './nvidiaHosted';
import type { VssClient } from './types';

/**
 * Three-way switch. Nothing else in the app should know which one is active.
 *
 *   NEXT_PUBLIC_VSS_MODE unset/'mock'  (default) → no GPU, no deployment, no API key
 *   NEXT_PUBLIC_VSS_MODE='nvidia-hosted'          → real NVIDIA-hosted VLM,
 *     called directly (integrate.api.nvidia.com) with NVIDIA_API_KEY — no
 *     VSS deployment, but real model output. See lib/vss/nvidiaHosted.ts.
 *   NEXT_PUBLIC_VSS_MODE='real', or the legacy USE_MOCK_VSS=false           → full VSS at LVS_URL/RTVI_URL
 *
 * NEXT_PUBLIC_ so RunLauncher (client-side) can decide whether to upload
 * real video bytes without a round trip — see components/RunLauncher.tsx.
 */
export const vssMode: 'mock' | 'nvidia-hosted' | 'real' =
  process.env.NEXT_PUBLIC_VSS_MODE === 'nvidia-hosted'
    ? 'nvidia-hosted'
    : process.env.NEXT_PUBLIC_VSS_MODE === 'real' || process.env.USE_MOCK_VSS === 'false'
      ? 'real'
      : 'mock';

export const useMock = vssMode === 'mock';

export const vss: VssClient =
  vssMode === 'nvidia-hosted' ? nvidiaHostedClient : vssMode === 'real' ? realClient : mockClient;

export * from './types';
export { mockProgress } from './mock';
