import { getHistoryForSession } from '../../modules/db/index.js';
import { logger } from '../../utils/logger.js';

export async function getChatHistory(req, res) {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
      res.status(400).json({ error: 'Invalid sessionId' });
      return;
    }

    const history = await getHistoryForSession(sessionId, 200);
    res.json({ sessionId, history });
  } catch (err) {
    logger.error('History fetch failed', { error: err.message });
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
}