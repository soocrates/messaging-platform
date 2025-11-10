import pg from 'pg';
import { config } from '../config/index.js';
import { requireAuthEnabled } from '../../utils/auth.js';
import { logger } from '../../utils/logger.js';

export async function runStartupChecks() {
  try {
    logger.info('Startup configuration', {
      requireAuth: requireAuthEnabled(),
      cognitoPool: config.cognito.userPoolId ? 'configured' : 'missing',
      cognitoRegion: config.cognito.region || 'unset',
      dynamoTable: config.database.dynamo.table || 'unset',
      dynamoEndpoint: config.database.dynamo.endpoint ? 'custom' : 'default',
      pgHost: config.database.postgres.host || 'unset',
      pgDatabase: config.database.postgres.database || 'unset'
    });

    // Test Postgres connection
    const { Pool } = pg;
    const pool = new Pool(config.database.postgres);
    
    try {
      await pool.query('SELECT 1');
      logger.info('Postgres connectivity check passed');
    } catch (err) {
      logger.error('Postgres connectivity check failed', { error: err.message });
    } finally {
      await pool.end();
    }
  } catch (err) {
    logger.error('Startup checks failed', { error: err.message });
  }
}