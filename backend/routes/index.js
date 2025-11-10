import express from 'express';
import healthRoutes from './health.js';
import authRoutes from './auth.routes.js';
import historyRoutes from './history.routes.js';
import supportRoutes from './support.routes.js';
import agentsRoutes from './agents.routes.js';

const router = express.Router();

// Mount all routes
router.use('/', healthRoutes);
router.use('/api/auth', authRoutes);
router.use('/history', historyRoutes);
router.use('/api/support', supportRoutes);
router.use('/api/agents', agentsRoutes);

export default router;