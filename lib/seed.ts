import type { UseCase, Source } from './types';

const now = new Date().toISOString();

export const seedSources: Source[] = [
  { id: 'src-cam03', name: 'loading-dock-cam03', kind: 'camera', status: 'online', vstSensorId: 'vst-cam03' },
  { id: 'src-cam07', name: 'aisle-cam07',        kind: 'camera', status: 'online', vstSensorId: 'vst-cam07' },
  { id: 'src-cam01', name: 'bay-b-cam01',        kind: 'camera', status: 'offline', vstSensorId: 'vst-cam01' },
];

/**
 * Starter profiles. These are the entire mechanism for supporting a new
 * domain — no new service, no new code. See design doc §2.
 */
export const seedUseCases: UseCase[] = [
  {
    id: 'uc-warehouse',
    slug: 'warehouse-safety',
    name: 'Warehouse Safety',
    icon: '🏭',
    description: 'Forklift proximity, PPE compliance, blocked emergency exits',

    scenario: 'A warehouse floor with forklifts, pallet stacks and personnel moving between loading bays.',
    objectsOfInterest: ['forklift', 'worker', 'helmet', 'hi_vis_vest', 'pallet'],
    events: [
      { id: 'ev-w1', code: 'forklift_proximity', label: 'Forklift near worker',     severity: 'high' },
      { id: 'ev-w2', code: 'blocked_exit',       label: 'Blocked emergency exit',   severity: 'high' },
      { id: 'ev-w3', code: 'ppe_violation',      label: 'Missing PPE',              severity: 'medium' },
      { id: 'ev-w4', code: 'spill',              label: 'Spill on floor',           severity: 'medium' },
    ],

    recordedPrompt: 'Summarize any safety-relevant events, with timestamps.',
    recordedSystemPrompt:
      'You are a safety compliance monitor for a warehouse floor. Flag forklift proximity to workers, missing PPE, and blocked emergency exits.',

    livePrompt: 'Narrate movement near the loading bays and call out proximity between vehicles and people.',
    liveSystemPrompt:
      'You are monitoring a live warehouse camera. Report safety-relevant activity as it happens, briefly.',

    alertPrompt: 'Raise an alert if a forklift comes within 2 metres of a person on foot, or if an emergency exit is obstructed.',
    alertSystemPrompt: 'You are a real-time safety alerting system for a warehouse.',

    verificationCriteria: 'Confirm only if a worker is clearly visible in frame and the hazard is unobstructed.',

    supportsRecorded: true,
    supportsLive: true,
    alertRuleCount: 4,
    lastRunAt: now,
    updatedAt: now,
  },
  {
    id: 'uc-sport',
    slug: 'sport-match-analysis',
    name: 'Sport Match Analysis',
    icon: '⚽',
    description: 'Goals, fouls, offside calls, substitutions',

    scenario: 'An outdoor football pitch with two teams of players, a referee and a ball.',
    objectsOfInterest: ['ball', 'player', 'referee', 'goalpost'],
    events: [
      { id: 'ev-s1', code: 'goal',         label: 'Goal scored',  severity: 'high' },
      { id: 'ev-s2', code: 'foul',         label: 'Foul',         severity: 'medium' },
      { id: 'ev-s3', code: 'offside',      label: 'Offside',      severity: 'medium' },
      { id: 'ev-s4', code: 'substitution', label: 'Substitution', severity: 'low' },
    ],

    recordedPrompt: 'Summarize the match, noting goals, fouls and offside decisions with timestamps.',
    recordedSystemPrompt:
      'You are a sports analyst reviewing football footage. Identify goals, fouls, offside, and player count on each play.',

    livePrompt: 'Commentate on play as it happens, noting possession and shots on target.',
    liveSystemPrompt: 'You are a live football match commentator. Be concise.',

    alertPrompt: 'Raise an alert when a goal is scored or a card is issued.',
    alertSystemPrompt: 'You are a real-time match event detector.',

    verificationCriteria: 'Confirm only if the ball and the relevant players are both visible in frame.',

    supportsRecorded: true,
    supportsLive: true,
    alertRuleCount: 1,
    lastRunAt: null,
    updatedAt: now,
  },
];
