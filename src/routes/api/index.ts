import { Router } from 'express';
import authRoutes from './auth.js';
import teacherRoutes from './teacher.js';
import studentRoutes from './student.js';
import classRoutes from './classes.js';
import { getAllPlans } from '../../services/subscription.js';

const router = Router();

// Public: Get all subscription plans
router.get('/plans', (req, res) => {
    res.json({ plans: getAllPlans() });
});

router.use('/auth', authRoutes);
router.use('/teacher', teacherRoutes);
router.use('/student', studentRoutes);
router.use('/classes', classRoutes);

export default router;
