import express from 'express';
import { 
  createCase, 
  pauseCase, 
  getContextualQuestions 
} from '../controllers/support.controller.js';
import { restRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/cases', restRateLimiter, createCase);
router.post('/cases/:caseId/pause', restRateLimiter, pauseCase);
router.post('/questions', restRateLimiter, getContextualQuestions);

export default router;