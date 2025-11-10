import express from 'express';
import { validateToken, exchangeToken } from '../controllers/auth.controller.js';
import { restRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/validate', restRateLimiter, validateToken);
router.post('/token', restRateLimiter, exchangeToken);

export default router;