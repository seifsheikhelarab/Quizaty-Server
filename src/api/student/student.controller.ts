import type { StudentRequest } from "../../middleware/apiAuth.js";
import type { Request, Response } from "express";
import { seededShuffle } from "../../utils/shuffle.js";
import type { Prisma } from "@prisma/client";
import prisma from '../../prisma.js';
import { getActiveSubscriptionForTeacher, getPlanLimits } from "../../services/subscription.js";


export async function getStudentDashboard(req: Request, res: Response) {
    const studentReq = req as StudentRequest;
    const student = studentReq.student;
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
}

export async function getClasses(req: Request, res: Response) {

    const student = (req as StudentRequest).student;

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
}

export async function getClassDetails(req: Request, res: Response) {

    const student = (req as StudentRequest).student;
    const classId = req.params.id as string;

    try {
        const studentRecord = await prisma.student.findUnique({
            where: { id: student.id },
            select: { shortCode: true }
        });

        const classData = await prisma.class.findFirst({
            where: { 
                id: classId,
                students: { some: { id: student.id } }
            },
            include: {
                teacher: { select: { id: true, name: true, phone: true } }
            }
        });

        if (!classData) return res.status(404).json({ error: 'Class not found' });

        const quizzes = await prisma.quiz.findMany({
            where: { classes: { some: { id: classId } } },
            select: { id: true, title: true, startTime: true, endTime: true, showResults: true },
            orderBy: { startTime: 'desc' }
        });

        res.json({ 
            classData: { ...classData, shortCode: studentRecord?.shortCode }, 
            quizzes 
        });
    } catch (error) {
        console.error("Error loading class details:", error);
        res.status(500).json({ error: "Failed to load class details" });
    }
}

export async function leaveClass(req: Request, res: Response) {

    const student = (req as StudentRequest).student;
    const _classId = req.params.id as string;

    try {
        // Remove student from class
        await prisma.student.update({
            where: { id: student.id },
            data: { classId: null }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error leaving class:", error);
        res.status(500).json({ error: "Failed to leave class" });
    }
}

export async function getQuizzes(req: Request, res: Response) {

    const student = (req as StudentRequest).student;

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
}

export async function getQuizDetails(req: Request, res: Response) {

    const student = (req as unknown as StudentRequest).student;
    const quizId = req.params.id as string;

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
}

export async function TakeQuiz(req: Request, res: Response) {

    const student = (req as unknown as StudentRequest).student;
    const quizId = req.params.id as string;

    try {
        // Verify student is enrolled in a class assigned to this quiz
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId },
            include: { questions: true, classes: true }
        });

        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        // Check enrollment
        const enrollment = await prisma.student.findFirst({
            where: { 
                id: student.id,
                class: { quizzes: { some: { id: quizId } } }
            }
        });
        if (!enrollment) {
            return res.status(403).json({ error: 'You are not enrolled in this quiz' });
        }

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
            // Track IP on first access
            const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
            currentSubmission = await prisma.submission.create({
                data: { 
                    studentId: student.id, 
                    quizId,
                    violations: {
                        startedAt: new Date().toISOString(),
                        ip: clientIP,
                        userAgent: req.get('user-agent') || 'unknown'
                    } as Prisma.InputJsonValue
                }
            });
        }

        // Shuffle questions and options based on submission ID (seeded shuffle)
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

        const parsedAnswers = currentSubmission.answers ? (currentSubmission.answers as Record<string, number>) : {};

        // Get student info for watermark
        const studentRecord = await prisma.student.findUnique({
            where: { id: student.id },
            select: { name: true, phone: true }
        });

        const activeSubscription = await getActiveSubscriptionForTeacher(quiz.teacherId);
        const antiCheatLevel = getPlanLimits(activeSubscription?.tier ?? "FREE_TRIAL").antiCheat;

        res.json({
            quiz: { ...quiz, questions: questionsWithOptions },
            submission: currentSubmission,
            savedAnswers: parsedAnswers,
            studentInfo: studentRecord ? { name: studentRecord.name, phone: studentRecord.phone } : undefined,
            antiCheatLevel,
        });
    } catch (error) {
        console.error("Error loading quiz test:", error);
        res.status(500).json({ error: "Failed to load quiz test" });
    }
}

export async function saveQuiz(req: Request, res: Response) {

    const student = (req as unknown as StudentRequest).student;
    const quizId = req.params.id as string;
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
            data: { answers: answers as Record<string, number> }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error saving answers:", error);
        res.status(500).json({ error: "Failed to save answers" });
    }
}

export async function submitQuiz(req: Request, res: Response) {

    const student = (req as StudentRequest).student;
    const quizId = req.params.id as string;
    let { answers } = req.body;
    if (!answers) answers = {};

    try {
        const quiz = await prisma.quiz.findUnique({ 
            where: { id: quizId }, 
            include: { 
                questions: true,
                classes: { select: { id: true } }
            } 
        });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        // Verify student is enrolled in a class assigned to this quiz
        const studentRecord = await prisma.student.findFirst({
            where: { 
                id: student.id,
                class: { 
                    quizzes: { some: { id: quizId } }
                }
            }
        });
        if (!studentRecord) {
            return res.status(403).json({ error: 'You are not enrolled in this quiz' });
        }

        const submission = await prisma.submission.findFirst({
            where: { studentId: student.id, quizId }
        });
        if (!submission) return res.status(404).json({ error: 'Submission not found' });

        if (submission.submittedAt) {
            return res.json({ success: true, alreadySubmitted: true });
        }

        const now = new Date();
        
        // Check quiz time window
        if (now < quiz.startTime) {
            return res.status(400).json({ error: 'Quiz has not started yet' });
        }
        if (now > quiz.endTime) {
            // Auto-submit with 0 score if past end time
            await prisma.submission.update({
                where: { id: submission.id },
                data: {
                    submittedAt: new Date(),
                    score: 0,
                    answers: answers as Record<string, number>
                }
            });
            return res.json({ success: true, autoSubmitted: true, score: 0, message: 'Quiz has ended' });
        }

        // Strict time limit check (no buffer)
        const timeLimit = new Date(submission.startedAt.getTime() + (quiz.duration * 60000));
        if (now > timeLimit) {
            // Auto-submit with current score if time expired
            let score = 0;
            quiz.questions.forEach((q) => {
                if (answers[q.id] == q.correctOption) score += (quiz.totalMarks / quiz.questions.length);
            });
            
            await prisma.submission.update({
                where: { id: submission.id },
                data: {
                    submittedAt: new Date(),
                    score: Math.round(score),
                    answers: answers as Record<string, number>
                }
            });
            return res.json({ success: true, autoSubmitted: true, score: Math.round(score), message: 'Time expired' });
        }

        // Calculate score (answers can be strings or numbers from frontend)
        let score = 0;
        quiz.questions.forEach((q) => {
            const answer = answers[q.id];
            const correct = parseInt(q.correctOption.toString());
            const studentAnswer = answer !== undefined ? parseInt(answer.toString()) : -1;
            if (studentAnswer === correct) score += (quiz.totalMarks / quiz.questions.length);
        });

        await prisma.submission.update({
            where: { id: submission.id },
            data: {
                submittedAt: new Date(),
                score: Math.round(score),
                answers: answers as Record<string, number>
            }
        });

        res.json({ success: true, score: Math.round(score) });
    } catch (error) {
        console.error("Error submitting quiz:", error);
        res.status(500).json({ error: "Failed to submit quiz" });
    }
}

export async function logViolation(req: Request, res: Response) {

    const student = (req as unknown as StudentRequest).student;
    const quizId = req.params.id as string;
    const { type, details, metadata } = req.body;

    try {
        const submission = await prisma.submission.findFirst({
            where: { studentId: student.id, quizId },
            include: { quiz: { include: { questions: true } } }
        });
        if (!submission || submission.submittedAt) {
            return res.status(400).json({ error: 'Invalid submission state' });
        }

        const violations = Array.isArray(submission.violations) ? submission.violations : [];
        violations.push({
            type,
            details,
            timestamp: new Date().toISOString(),
            ip: req.ip || req.socket.remoteAddress || 'unknown',
            userAgent: req.get('user-agent') || 'unknown',
            metadata: metadata || {}
        });

        // Auto-submit after 3 violations (configurable)
        const shouldAutoSubmit = violations.length >= 3;

        await prisma.submission.update({
            where: { id: submission.id },
            data: {
                violations: violations as Prisma.InputJsonValue,
                ...(shouldAutoSubmit ? {
                    submittedAt: new Date(),
                    score: 0 // Zero score for cheating
                } : {})
            }
        });

        if (shouldAutoSubmit) {
            return res.json({ success: true, autoSubmitted: true, score: 0, reason: 'Too many violations' });
        }

        res.json({ success: true, violationCount: violations.length });
    } catch (error) {
        console.error("Error logging violation:", error);
        res.status(500).json({ error: "Failed to log violation" });
    }
}

export async function getQuizResults(req: Request, res: Response) {

    const student = (req as StudentRequest).student;
    const quizId = req.params.id as string;

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
}
