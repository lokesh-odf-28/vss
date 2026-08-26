import { hasDatabase } from '../db';
import * as memory from './memory';
import * as postgres from './postgres';

/**
 * Single switch between the in-memory store and Postgres.
 *
 *   DATABASE_URL unset → in-memory (zero setup, resets on reload)
 *   DATABASE_URL set   → Postgres, schema in db/schema.sql
 *
 * Every caller imports from '@/lib/store', so nothing else changes.
 */
const impl = hasDatabase ? postgres : memory;

export const storeBackend = hasDatabase ? 'postgres' : 'memory';

export const listUseCases = impl.listUseCases;
export const getUseCase   = impl.getUseCase;
export const saveUseCase   = impl.saveUseCase;
export const createUseCase = impl.createUseCase;
export const deleteUseCase = impl.deleteUseCase;
export const listAlertRules = impl.listAlertRules;
export const createAlertRule = impl.createAlertRule;
export const updateAlertRuleEnabled = impl.updateAlertRuleEnabled;
export const deleteAlertRule = impl.deleteAlertRule;
export const listSources  = impl.listSources;
export const getSource    = impl.getSource;
export const createSource = impl.createSource;
export const listRuns     = impl.listRuns;
export const getRun       = impl.getRun;
export const createRun    = impl.createRun;
export const updateRun     = impl.updateRun;
export const getUserByEmail = impl.getUserByEmail;
export const getUserById     = impl.getUserById;
export const createOrgAndUser  = impl.createOrgAndUser;
export const updateUserPassword = impl.updateUserPassword;
export const createOtpChallenge = impl.createOtpChallenge;
export const getOtpChallenge = impl.getOtpChallenge;
export const incrementOtpAttempts = impl.incrementOtpAttempts;
export const deleteOtpChallenge = impl.deleteOtpChallenge;
export const completeRunWithIncidents = impl.completeRunWithIncidents;
export const createIncidents = impl.createIncidents;
export const listIncidentsByRun = impl.listIncidentsByRun;
