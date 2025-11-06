import { saveMessageDynamo, getHistoryDynamo } from './dynamo.js';
import { saveMessagePostgres, getHistoryPostgres } from './postgres.js';
import { logger } from '../../utils/logger.js';

export async function saveMessage(message) {
  try {
    await saveMessageDynamo(message);
  } catch (err) {
    logger.error('Dynamo save failed', { error: err.message });
  }
  try {
    await saveMessagePostgres(message);
  } catch (err) {
    logger.error('Postgres save failed', { error: err.message });
  }
}

export async function getHistoryForSession(sessionId, limit = 200) {
  const [dd, pg] = await Promise.allSettled([
    getHistoryDynamo(sessionId),
    getHistoryPostgres(sessionId)
  ]);

  const dynamo = dd.status === 'fulfilled' ? dd.value : [];
  const postgres = pg.status === 'fulfilled' ? pg.value : [];

  const key = (m) => `${m.timestamp}|${m.sender}|${m.content}`;
  const seen = new Set();
  const merged = [];

  for (const m of [...dynamo, ...postgres]) {
    const k = key(m);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(m);
    }
  }

  merged.sort((a, b) => a.timestamp - b.timestamp);
  // return only the last N messages
  return merged.slice(Math.max(0, merged.length - limit));
}

