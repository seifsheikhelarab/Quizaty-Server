import { Router } from 'express';
import authRoutes from './auth/auth.router.js';
import teacherRoutes from './teacher/teacher.router.js';
import studentRoutes from './student/student.router.js';
import classRoutes from './classes/classes.router.js';
import { getAllPlans } from '../services/subscription.js';
import { apiLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Public: Get all subscription plans
router.get('/plans', (req, res) => {
    res.json({ plans: getAllPlans() });
});

router.use('/auth', authRoutes);
router.use('/teacher', apiLimiter, teacherRoutes);
router.use('/student', apiLimiter, studentRoutes);
router.use('/classes', classRoutes);

export default router;
