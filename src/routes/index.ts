import { Router } from 'express';
import authRoutes from './auth.ts';
import teacherRoutes from './teacher.ts';
import quizRoutes from './quiz.ts';
import studentRoutes from './student.ts';

const router = Router();

router.get('/', (req, res) => {
    res.redirect('/teacher/dashboard');
});

router.use('/auth', authRoutes);
router.use('/teacher', teacherRoutes);
router.use('/quiz', quizRoutes);
router.use('/student', studentRoutes);

export default router;
