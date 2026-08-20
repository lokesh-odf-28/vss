// Domain types — mirror db/schema.sql

export type Severity = 'low' | 'medium' | 'high';
export type Verdict = 'confirmed' | 'rejected' | 'unverified';
export type RunMode = 'recorded' | 'live';
export type RunStatus = 'queued' | 'uploading' | 'processing' | 'complete' | 'failed';

export interface UseCaseEvent {
  id: string;
  code: string;
  label: string;
  severity: Severity;
}

/** One use case configures four VSS subsystems. See design doc §2. */
export interface UseCase {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;

  // Scene — shared
  scenario: string;
  objectsOfInterest: string[];
  events: UseCaseEvent[];

  // Recorded  → LVS /v1/summarize
  recordedPrompt: string;
  recordedSystemPrompt: string;

  // Live      → LVS /v1/stream_summarize
  livePrompt: string;
  liveSystemPrompt: string;

  // Alerts    → Alert Bridge /realtime
  alertPrompt: string;
  alertSystemPrompt: string;

  // Search & verification → CA-RAG
  verificationCriteria: string;

  supportsRecorded: boolean;
  supportsLive: boolean;

  alertRuleCount: number;
  lastRunAt: string | null;
  updatedAt: string;
}

export interface Source {
  id: string;
  name: string;
  kind: 'camera' | 'upload';
  status: 'online' | 'offline' | 'error';
  vstSensorId?: string;
}

export interface Run {
  id: string;
  useCaseId: string;
  useCaseName: string;
  sourceId: string;
  sourceName: string;
  mode: RunMode;
  status: RunStatus;
  /** Two separate phases — never merge these into one bar. Design doc §7.2. */
  uploadPercent: number;
  analysisPercent: number;
  externalJobId: string | null;
  summary: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  incidentCount: number;
}

export interface Incident {
  id: string;
  sourceId: string;
  /** Nullable by design — incidents outlive their run. Design doc §8. */
  runId: string | null;
  offsetMs: number;
  eventCode: string;
  severity: Severity | 'clear';
  description: string;
  verdict: Verdict;
  thumbnailUrl: string | null;
}
