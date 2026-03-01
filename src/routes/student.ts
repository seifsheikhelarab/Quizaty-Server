import { Router } from 'express';
import prisma from '../prisma.ts';
import { authenticateStudent } from '../middleware.ts';

const router = Router();
router.use(authenticateStudent);

router.get('/dashboard', async (req, res) => {
    const student = (req as any).student;
    const now = new Date();

    const [upcomingCount, classesCount] = await Promise.all([
        prisma.quiz.count({
            where: {
                classes: { some: { students: { some: { id: student.id } } } },
                endTime: { gte: now }
            }
        }),
        prisma.class.count({
            where: { students: { some: { id: student.id } } }
        })
    ]);

    res.render('student/dashboard', {
        title: 'Student Dashboard',
        student,
        stats: { upcomingQuizzes: upcomingCount, classes: classesCount }
    });
});

router.get('/classes', async (req, res) => {
    const student = (req as any).student;

    const classes = await prisma.class.findMany({
        where: { students: { some: { id: student.id } } },
        include: {
            _count: { select: { students: true } },
            teacher: true
        },
        orderBy: { name: 'asc' }
    });

    res.render('student/classes', { title: 'My Classes', student, classes });
});

router.get('/quizzes', async (req, res) => {
    const student = (req as any).student;

    const quizzes = await prisma.quiz.findMany({
        where: {
            classes: { some: { students: { some: { id: student.id } } } }
        },
        include: { teacher: true },
        orderBy: { startTime: 'desc' }
    });

    const submissions = await prisma.submission.findMany({
        where: { studentId: student.id },
        select: { quizId: true, submittedAt: true }
    });

    const submissionMap = new Map(submissions.map(s => [s.quizId, s]));

    res.render('student/quizzes', {
        title: 'Quizzes',
        student,
        quizzes,
        submissionMap: Object.fromEntries(submissionMap)
    });
});

router.get('/quizzes/:id', async (req, res) => {
    const student = (req as any).student;
    const quizId = req.params.id;

    const quiz = await prisma.quiz.findUnique({
        where: {
            id: quizId,
            classes: { some: { students: { some: { id: student.id } } } }
        },
        include: { teacher: true }
    });

    if (!quiz) return res.status(404).send('Quiz not found');

    const submission = await prisma.submission.findFirst({
        where: { studentId: student.id, quizId }
    });

    res.render('student/quiz_detail', {
        title: quiz.title,
        student,
        quiz,
        submission
    });
});

export default router;