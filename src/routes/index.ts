import { Router } from 'express';
import authRoutes from './auth';
import teacherRoutes from './teacher';
import quizRoutes from './quiz';

const router = Router();

router.get('/', (req, res) => {
    res.redirect('/teacher/dashboard');
});

router.use('/auth', authRoutes);
router.use('/teacher', teacherRoutes);
router.use('/quiz', quizRoutes);

export default router;
