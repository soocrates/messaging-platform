import express from 'express';
import { getChatHistory } from '../controllers/history.controller.js';
import { restRateLimiter } from '../middleware/rateLimit.js';
import { validateSession } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/:sessionId', restRateLimiter, validateSession, getChatHistory);

export default router;