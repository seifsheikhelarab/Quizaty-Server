import { Router } from 'express';
import prisma from '../prisma';
import { authenticateStudent } from '../middleware';

const router = Router();
router.use(authenticateStudent);

router.get('/dashboard', async (req, res) => {
    const student = (req as any).student;

    // Fetch quizzes assigned to this student's class
    const availableQuizzes = await prisma.quiz.findMany({
        where: {
            classes: {
                some: { id: student.classId || undefined }
            }
        },
        include: { teacher: true }
    });

    // Fetch student's past submissions
    const submissions = await prisma.submission.findMany({
        where: { studentId: student.id },
        include: { quiz: true }
    });

    res.render('student/dashboard', { title: 'Student Dashboard', student, availableQuizzes, submissions });
});

export default router;