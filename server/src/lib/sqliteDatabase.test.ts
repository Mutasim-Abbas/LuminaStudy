import { createRequire } from 'node:module';
import { describeDatabaseContract } from './databaseContract.js';
import { sqliteDatabase } from './sqliteDatabase.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describeDatabaseContract('local SQLite', async () => sqliteDatabase(new DatabaseSync(':memory:')));
