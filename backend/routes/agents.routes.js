import express from 'express';
import { getOnlineAgents } from '../controllers/agents.controller.js';
import { restRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.get('/online', restRateLimiter, getOnlineAgents);

export default router;