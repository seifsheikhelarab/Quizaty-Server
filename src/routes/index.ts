import { Router } from 'express';
import authRoutes from './auth.js';
import teacherRoutes from './teacher.js';
import quizRoutes from './quiz.js';
import studentRoutes from './student.js';
import adminRoutes from './admin.js';

const router = Router();

router.get('/', (req, res) => {
    res.redirect('/teacher/dashboard');
});

router.use('/auth', authRoutes);
router.use('/teacher', teacherRoutes);
router.use('/quiz', quizRoutes);
router.use('/student', studentRoutes);
router.use('/admin', adminRoutes);

export default router;
