import { Router } from 'express';
import prisma from '../prisma.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { seededShuffle } from '../utils/shuffle.js';

const router = Router();

router.get('/:studentId/:quizId', async (req, res) => {
    const { studentId, quizId } = req.params;
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    const quiz = await prisma.quiz.findUnique({
        where: { id: quizId },
        include: { questions: true }
    });

    if (!student || !quiz) {
        throw new NotFoundError('Student or Quiz');
    }

    const submission = await prisma.submission.findFirst({
        where: { studentId, quizId }
    });

    if (submission?.submittedAt) {
        res.redirect(`/quiz/${studentId}/${quizId}/result`);
        return;
    }

    const now = new Date();
    if (now < quiz.startTime) throw new BadRequestError('Quiz has not started yet.');
    if (now > quiz.endTime) throw new BadRequestError('Quiz has ended.');

    let currentSubmission = submission;
    if (!currentSubmission) {
        currentSubmission = await prisma.submission.create({
            data: { studentId, quizId }
        });
    }

    // Shuffle questions and options based on submission ID
    const shuffledQuestions = seededShuffle([...quiz.questions], currentSubmission.id);
    const questionsWithOptions = shuffledQuestions.map(q => {
        const indices = q.options.map((_, i) => i);
        const shuffledIndices = seededShuffle(indices, currentSubmission.id + q.id);
        return {
            ...q,
            shuffledOptions: shuffledIndices.map(i => ({ originalIndex: i, text: q.options[i] }))
        }
    });

    const parsedAnswers = currentSubmission.answers ? (currentSubmission.answers as any) : {};

    res.render('student/quiz', {
        title: quiz.title,
        student,
        quiz: { ...quiz, questions: questionsWithOptions },
        submission: currentSubmission,
        savedAnswers: parsedAnswers,
        layout: false
    });
});

router.post('/:studentId/:quizId/submit', async (req, res) => {
    const { studentId, quizId } = req.params;
    let { answers } = req.body;
    if (!answers) answers = {};

    const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: true } });
    if (!quiz) throw new NotFoundError('Quiz');

    const submission = await prisma.submission.findFirst({
        where: { studentId, quizId }
    });
    if (!submission) throw new NotFoundError('Submission');
    if (submission.submittedAt) {
        res.redirect(`/quiz/${studentId}/${quizId}/result`);
        return;
    }

    const now = new Date();
    const timeLimit = new Date(submission.startedAt.getTime() + (quiz.duration * 60000) + (2 * 60000));

    if (now > timeLimit || now > quiz.endTime) {
        throw new BadRequestError('Quiz submission time has expired.');
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

    res.redirect(`/quiz/${studentId}/${quizId}/result`);
});

router.post('/:studentId/:quizId/save', async (req, res) => {
    const { studentId, quizId } = req.params;
    const { answers } = req.body;
    if (!answers) return res.status(400).json({ error: 'No answers provided' });

    const submission = await prisma.submission.findFirst({
        where: { studentId, quizId }
    });
    if (!submission || submission.submittedAt) {
        return res.status(400).json({ error: 'Invalid submission state' });
    }

    await prisma.submission.update({
        where: { id: submission.id },
        data: { answers: answers as any }
    });

    res.json({ success: true });
});

router.post('/:studentId/:quizId/violation', async (req, res) => {
    const { studentId, quizId } = req.params;
    const { type, details } = req.body;

    const submission = await prisma.submission.findFirst({
        where: { studentId, quizId }
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

    await prisma.submission.update({
        where: { id: submission.id },
        data: { violations: violations as any }
    });

    res.json({ success: true });
});

router.get('/:studentId/:quizId/result', async (req, res) => {
    const { studentId, quizId } = req.params;
    const submission = await prisma.submission.findFirst({
        where: { studentId, quizId },
        include: {
            quiz: { include: { questions: { orderBy: { id: 'asc' } } } },
            student: true
        }
    });

    if (!submission) throw new NotFoundError('Submission');

    res.render('student/result', { title: 'Submission Details', submission, layout: false });
});

export default router;
