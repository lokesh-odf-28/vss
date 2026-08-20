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
export const saveUseCase  = impl.saveUseCase;
export const listSources  = impl.listSources;
export const getSource    = impl.getSource;
export const listRuns     = impl.listRuns;
export const getRun       = impl.getRun;
export const createRun    = impl.createRun;
export const updateRun    = impl.updateRun;
