import { Router } from 'express';
import prisma from '../../prisma.js';
import { authenticateStudentAPI } from '../../middleware/apiAuth.js';
import { seededShuffle } from '../../utils/shuffle.js';

const router = Router();
router.use(authenticateStudentAPI);

// GET /api/student/dashboard
router.get('/dashboard', async (req, res) => {
    const student = (req as any).student;
    const now = new Date();

    try {
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

        res.json({
            student,
            stats: { upcomingQuizzes: upcomingCount, classes: classesCount }
        });
    } catch (error) {
        console.error("Error loading dashboard:", error);
        res.status(500).json({ error: "Failed to load dashboard" });
    }
});

// GET /api/student/classes
router.get('/classes', async (req, res) => {
    const student = (req as any).student;

    try {
        const classes = await prisma.class.findMany({
            where: { students: { some: { id: student.id } } },
            include: {
                _count: { select: { students: true } },
                teacher: { select: { id: true, name: true } }
            },
            orderBy: { name: 'asc' }
        });

        res.json({ classes });
    } catch (error) {
        console.error("Error loading classes:", error);
        res.status(500).json({ error: "Failed to load classes" });
    }
});

// GET /api/student/quizzes
router.get('/quizzes', async (req, res) => {
    const student = (req as any).student;

    try {
        const quizzes = await prisma.quiz.findMany({
            where: {
                classes: { some: { students: { some: { id: student.id } } } }
            },
            include: { teacher: { select: { id: true, name: true } } },
            orderBy: { startTime: 'desc' }
        });

        const submissions = await prisma.submission.findMany({
            where: { studentId: student.id },
            select: { quizId: true, submittedAt: true }
        });

        const submissionMap = new Map(submissions.map(s => [s.quizId, s]));

        res.json({
            quizzes,
            submissionMap: Object.fromEntries(submissionMap)
        });
    } catch (error) {
        console.error("Error loading quizzes:", error);
        res.status(500).json({ error: "Failed to load quizzes" });
    }
});

// GET /api/student/quizzes/:id
router.get('/quizzes/:id', async (req, res) => {
    const student = (req as any).student;
    const quizId = req.params.id;

    try {
        const quiz = await prisma.quiz.findUnique({
            where: {
                id: quizId,
                classes: { some: { students: { some: { id: student.id } } } }
            },
            include: { teacher: { select: { id: true, name: true } } }
        });

        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const submission = await prisma.submission.findFirst({
            where: { studentId: student.id, quizId }
        });

        res.json({ quiz, submission });
    } catch (error) {
        console.error("Error loading quiz detail:", error);
        res.status(500).json({ error: "Failed to load quiz" });
    }
});

// GET /api/student/quizzes/:id/test (Initiate/resume quiz)
router.get('/quizzes/:id/test', async (req, res) => {
    const student = (req as any).student;
    const quizId = req.params.id;

    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, classes: { some: { students: { some: { id: student.id } } } } },
            include: { questions: true }
        });

        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const submission = await prisma.submission.findFirst({
            where: { studentId: student.id, quizId }
        });

        if (submission?.submittedAt) {
            return res.status(400).json({ error: 'Quiz already submitted', redirect: `/student/quizzes/${quizId}/result` });
        }

        const now = new Date();
        if (now < quiz.startTime) return res.status(400).json({ error: 'Quiz has not started yet.' });
        if (now > quiz.endTime) return res.status(400).json({ error: 'Quiz has ended.' });

        let currentSubmission = submission;
        if (!currentSubmission) {
            currentSubmission = await prisma.submission.create({
                data: { studentId: student.id, quizId }
            });
        }

        // Shuffle questions and options based on submission ID
        const shuffledQuestions = seededShuffle([...quiz.questions], currentSubmission.id);
        const questionsWithOptions = shuffledQuestions.map(q => {
            const indices = q.options.map((_, i) => i);
            const shuffledIndices = seededShuffle(indices, currentSubmission.id + q.id);
            return {
                id: q.id,
                questionText: q.questionText,
                imageUrl: q.imageUrl,
                shuffledOptions: shuffledIndices.map(i => ({ originalIndex: i, text: q.options[i] }))
            };
        });

        const parsedAnswers = currentSubmission.answers ? (currentSubmission.answers as any) : {};

        res.json({
            quiz: { ...quiz, questions: questionsWithOptions },
            submission: currentSubmission,
            savedAnswers: parsedAnswers
        });
    } catch (error) {
        console.error("Error loading quiz test:", error);
        res.status(500).json({ error: "Failed to load quiz test" });
    }
});

// POST /api/student/quizzes/:id/save
router.post('/quizzes/:id/save', async (req, res) => {
    const student = (req as any).student;
    const quizId = req.params.id;
    const { answers } = req.body;
    if (!answers) return res.status(400).json({ error: 'No answers provided' });

    try {
        const submission = await prisma.submission.findFirst({
            where: { studentId: student.id, quizId }
        });
        if (!submission || submission.submittedAt) {
            return res.status(400).json({ error: 'Invalid submission state' });
        }

        await prisma.submission.update({
            where: { id: submission.id },
            data: { answers: answers as any }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error saving answers:", error);
        res.status(500).json({ error: "Failed to save answers" });
    }
});

// POST /api/student/quizzes/:id/submit
router.post('/quizzes/:id/submit', async (req, res) => {
    const student = (req as any).student;
    const quizId = req.params.id;
    let { answers } = req.body;
    if (!answers) answers = {};

    try {
        const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: true } });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const submission = await prisma.submission.findFirst({
            where: { studentId: student.id, quizId }
        });
        if (!submission) return res.status(404).json({ error: 'Submission not found' });
        
        if (submission.submittedAt) {
            return res.json({ success: true, alreadySubmitted: true });
        }

        const now = new Date();
        const timeLimit = new Date(submission.startedAt.getTime() + (quiz.duration * 60000) + (2 * 60000));

        if (now > timeLimit || now > quiz.endTime) {
            // we will still submit but maybe mark as late? For now just submit it.
            // The existing logic throws an error. Let's just submit with the answers we have.
            // Or throw an error so the client knows it was rejected.
            // Actually the prompt says if past timeLimit, throw BadRequest.
            return res.status(400).json({ error: 'Quiz submission time has expired.' });
        }

        let score = 0;
        quiz.questions.forEach((q) => {
            if (answers[q.id] == q.correctOption) score += (quiz.totalMarks / quiz.questions.length);
        });

        await prisma.submission.update({
            where: { id: submission.id },
            data: {
                submittedAt: new Date(),
                score: Math.round(score),
                answers: answers as any
            }
        });

        res.json({ success: true, score: Math.round(score) });
    } catch (error) {
        console.error("Error submitting quiz:", error);
        res.status(500).json({ error: "Failed to submit quiz" });
    }
});

// POST /api/student/quizzes/:id/violation
router.post('/quizzes/:id/violation', async (req, res) => {
    const student = (req as any).student;
    const quizId = req.params.id;
    const { type, details } = req.body;

    try {
        const submission = await prisma.submission.findFirst({
            where: { studentId: student.id, quizId },
            include: { quiz: { include: { questions: true } } }
        });
        if (!submission || submission.submittedAt) {
            return res.status(400).json({ error: 'Invalid submission state' });
        }

        let violations = Array.isArray(submission.violations) ? submission.violations : [];
        violations.push({
            type,
            details,
            timestamp: new Date().toISOString()
        });

        const shouldAutoSubmit = violations.length >= 3;

        const updatedSubmission = await prisma.submission.update({
            where: { id: submission.id },
            data: { 
                violations: violations as any,
                ...(shouldAutoSubmit ? {
                    submittedAt: new Date(),
                    // Calculate score current state if auto-submitting
                    score: 0 // Default to 0 or calculate based on current answers
                } : {})
            }
        });

        if (shouldAutoSubmit) {
            // Recalculate score if it was auto-submitted
            let score = 0;
            const answers = (submission.answers as any) || {};
            submission.quiz.questions.forEach((q) => {
                if (answers[q.id] == q.correctOption) score += (submission.quiz.totalMarks / submission.quiz.questions.length);
            });
            
            await prisma.submission.update({
                where: { id: submission.id },
                data: { score: Math.round(score) }
            });
            
            return res.json({ success: true, autoSubmitted: true, score: Math.round(score) });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error logging violation:", error);
        res.status(500).json({ error: "Failed to log violation" });
    }
});

// GET /api/student/quizzes/:id/result
router.get('/quizzes/:id/result', async (req, res) => {
    const student = (req as any).student;
    const quizId = req.params.id;

    try {
        const submission = await prisma.submission.findFirst({
            where: { studentId: student.id, quizId },
            include: {
                quiz: { include: { questions: { orderBy: { id: 'asc' } } } },
                student: true
            }
        });

        if (!submission) return res.status(404).json({ error: 'Submission not found' });

        res.json({ submission });
    } catch (error) {
        console.error("Error loading result:", error);
        res.status(500).json({ error: "Failed to load result" });
    }
});

export default router;
