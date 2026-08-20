import { mockClient } from './mock';
import { realClient } from './client';
import type { VssClient } from './types';

/**
 * Single switch between mocked and real VSS.
 *
 *   USE_MOCK_VSS=true   (default) → build UI with no GPU, no deployment
 *   USE_MOCK_VSS=false            → hit the real stack at LVS_URL
 *
 * Nothing else in the app should know which one is active.
 */
export const useMock = process.env.USE_MOCK_VSS !== 'false';
export const vss: VssClient = useMock ? mockClient : realClient;

export * from './types';
export { mockProgress } from './mock';
