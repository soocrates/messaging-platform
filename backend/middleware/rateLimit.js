import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

export const restRateLimiter = rateLimit({ 
  windowMs: config.rateLimit.windowMs, 
  max: config.rateLimit.maxRequests, 
  standardHeaders: true, 
  legacyHeaders: false 
});