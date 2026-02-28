import { Router } from 'express';
import prisma from '../prisma';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { bot } from '../services/telegram';

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

    res.render('student/quiz', { title: quiz.title, student, quiz, submission: currentSubmission, layout: false });
});

router.post('/:studentId/:quizId/submit', async (req, res) => {
    const { studentId, quizId } = req.params;
    let { answers } = req.body;
    if (!answers) answers = [];

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
    quiz.questions.forEach((q, idx) => {
        if (answers[idx] == q.correctOption) score += (quiz.totalMarks / quiz.questions.length);
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

router.get('/:studentId/:quizId/result', async (req, res) => {
    const { studentId, quizId } = req.params;
    const submission = await prisma.submission.findFirst({
        where: { studentId, quizId },
        include: { quiz: true, student: true }
    });

    if (!submission) throw new NotFoundError('Submission');

    res.render('student/result', { title: 'Result', submission, layout: false });
});

export default router;
