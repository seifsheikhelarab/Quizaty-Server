import type { Request, Response } from "express";
import type { TeacherRequest } from "../../middleware/apiAuth.js";
import { Prisma, type SubscriptionTier } from "@prisma/client";
import prisma from "../../prisma.js";
import { getActiveSubscriptionForTeacher, getPlanLimits, checkQuizLimit } from "../../services/subscription.js";
import { logger } from "../../utils/logger.js";
import { uploadToCloudinary } from "../../services/cloudinary.js";

export async function getQuizzes(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    try {
        const quizzes = await prisma.quiz.findMany({
            where: { teacherId: teacher.id },
            include: {
                _count: { select: { questions: true, submissions: true } },
                classes: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ quizzes });
    } catch (error) {
        console.error("Error fetching quizzes:", error);
        res.status(500).json({ error: "Error loading quizzes" });
    }
}

export async function getQuizDetails(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const quizId = req.params.id as string;

    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: {
                questions: { orderBy: { id: 'asc' } },
                classes: { 
                    include: { _count: { select: { students: true } } }
                },
                submissions: {
                    include: { 
                        student: { select: { id: true, name: true, phone: true } },
                        quiz: { select: { totalMarks: true } }
                    },
                    orderBy: { submittedAt: 'desc' }
                }
            }
        });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        const quizClasses = quiz.classes || [];
        const completedSubmissions = quiz.submissions.filter(s => s.submittedAt);
        const participation = quizClasses.reduce((sum, c) => sum + (c._count?.students || 0), 0);
        
        let bestScore: number | null = null;
        let worstScore: number | null = null;
        let totalScorePercentage = 0;
        let validSubmissionsCount = 0;

        quiz.submissions.forEach((sub) => {
            if (sub.submittedAt && sub.quiz && sub.quiz.totalMarks > 0) {
                const percentage = (sub.score / sub.quiz.totalMarks) * 100;
                if (bestScore === null || percentage > bestScore) bestScore = percentage;
                if (worstScore === null || percentage < worstScore) worstScore = percentage;
                totalScorePercentage += percentage;
                validSubmissionsCount++;
            }
        });

        const analysis = {
            bestScore: bestScore !== null ? Number(bestScore).toFixed(1) + '%' : 'N/A',
            worstScore: worstScore !== null ? Number(worstScore).toFixed(1) + '%' : 'N/A',
            avgScore: validSubmissionsCount > 0 ? Number(totalScorePercentage / validSubmissionsCount).toFixed(1) + '%' : 'N/A',
            participation: `${completedSubmissions.length}/${participation}`
        };

        const leaderboard = completedSubmissions
            .map(sub => ({
                id: sub.id,
                score: sub.score,
                startedAt: sub.startedAt,
                submittedAt: sub.submittedAt,
                student: sub.student
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        // Get students who didn't attempt and students with violations
        const assignedStudentIds = new Set(completedSubmissions.map(s => s.student.id));
        
        // Get all students in quiz classes who haven't submitted
        const classIds = quizClasses.map(c => c.id);
        const allClassStudents = await prisma.student.findMany({
            where: { classId: { in: classIds } },
            select: { id: true, name: true, phone: true, parentPhone: true }
        });
        
        const nonAttempted = allClassStudents
            .filter(s => !assignedStudentIds.has(s.id))
            .map(s => ({ id: s.id, name: s.name, phone: s.phone, parentPhone: s.parentPhone }));

        // Get submissions with violations
        let studentsWithViolations: { id: string; student: { id: string; name: string; phone: string; parentPhone: string | null }; violations: unknown }[] = [];
        try {
            const submissionsWithViolations = await prisma.submission.findMany({
                where: { 
                    quizId,
                    violations: { not: Prisma.JsonNull }
                },
                include: { 
                    student: { select: { id: true, name: true, phone: true, parentPhone: true } }
                }
            });

            studentsWithViolations = submissionsWithViolations
                .filter(s => s.violations && Array.isArray(s.violations) && s.violations.length > 0)
                .map(s => ({ 
                    id: s.id, 
                    student: s.student, 
                    violations: s.violations 
                }));
        } catch (e) {
            logger.info(`No violations found or error: ${e}`);
        }

        const hasWhatsApp = limits.whatsapp !== 'none';

        res.json({ 
            quiz, 
            analysis,
            leaderboard,
            submissions: quiz.submissions,
            limits,
            nonAttempted: hasWhatsApp ? nonAttempted : [],
            studentsWithViolations: hasWhatsApp ? studentsWithViolations : []
        });
    } catch (error) {
        console.error("Error fetching quiz details:", error);
        res.status(500).json({ error: "Error loading quiz details" });
    }
}

export async function exportQuiz(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const quizId = req.params.id as string;

    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: {
                questions: { orderBy: { id: 'asc' } },
                classes: { select: { id: true, name: true } }
            }
        });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${quiz.title}.csv"`);

        let csv = 'Question,Option 1,Option 2,Option 3,Option 4,Correct Option\n';
        quiz.questions.forEach((q) => {
            const row = [
                `"${q.questionText.replace(/"/g, '""')}"`,
                `"${(q.options[0] || '').replace(/"/g, '""')}"`,
                `"${(q.options[1] || '').replace(/"/g, '""')}"`,
                `"${(q.options[2] || '').replace(/"/g, '""')}"`,
                `"${(q.options[3] || '').replace(/"/g, '""')}"`,
                q.correctOption + 1
            ];
            csv += row.join(',') + '\n';
        });

        res.send(csv);
    } catch (error) {
        console.error("Export quiz error:", error);
        res.status(500).json({ error: "Error exporting quiz" });
    }
}

export async function createQuiz(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const { title, description, duration, startTime, endTime, classIds, questions } = req.body;

    if (!title || !duration || !startTime || !endTime || !classIds?.length || !questions?.length) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        
        const quizCheck = await checkQuizLimit(teacher.id, tier);
        if (!quizCheck.allowed) {
            return res.status(403).json({ error: `You have reached the maximum number of quizzes (${quizCheck.max}).` });
        }

        const totalMarks = questions.reduce((sum: number, q: { marks?: number }) => sum + (q.marks || 10), 0);

        const quiz = await prisma.quiz.create({
            data: {
                title,
                description,
                duration: parseInt(duration),
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                totalMarks,
                teacherId: teacher.id,
                classes: { connect: classIds.map((id: string) => ({ id })) },
                questions: {
                    create: questions.map((q: { questionText: string; options: string[]; correctOption: number; marks?: number; imageUrl?: string }) => ({
                        questionText: q.questionText,
                        options: q.options,
                        correctOption: q.correctOption,
                        imageUrl: q.imageUrl || null
                    }))
                }
            },
            include: { questions: true }
        });

        res.json({ quiz });
    } catch (error) {
        console.error("Error creating quiz:", error);
        res.status(500).json({ error: "Error creating quiz" });
    }
}

export async function updateQuiz(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const quizId = req.params.id as string;
    const { title, description, duration, startTime, endTime, questions } = req.body;

    try {
        const existingQuiz = await prisma.quiz.findUnique({ where: { id: quizId, teacherId: teacher.id } });
        if (!existingQuiz) return res.status(404).json({ error: 'Quiz not found' });

        await prisma.$transaction(async (tx) => {
            const updated = await tx.quiz.update({
                where: { id: quizId },
                data: {
                    ...(title && { title }),
                    ...(description !== undefined && { description }),
                    ...(duration && { duration: parseInt(duration) }),
                    ...(startTime && { startTime: new Date(startTime) }),
                    ...(endTime && { endTime: new Date(endTime) })
                }
            });

            if (questions) {
                await tx.question.deleteMany({ where: { quizId } });
                const totalMarks = questions.reduce((sum: number, q: { marks?: number }) => sum + (q.marks || 10), 0);
                await tx.quiz.update({
                    where: { id: quizId },
                    data: { totalMarks }
                });

                await tx.question.createMany({
                    data: questions.map((q: { questionText: string; options: string[]; correctOption: number; marks?: number; imageUrl?: string }) => ({
                        questionText: q.questionText,
                        options: q.options,
                        correctOption: q.correctOption,
                        imageUrl: q.imageUrl || null,
                        quizId
                    }))
                });
            }

            return updated;
        });

        const fullQuiz = await prisma.quiz.findUnique({
            where: { id: quizId },
            include: { questions: { orderBy: { id: 'asc' } } }
        });

        res.json({ quiz: fullQuiz });
    } catch (error) {
        console.error("Error updating quiz:", error);
        res.status(500).json({ error: "Error updating quiz" });
    }
}

export async function getQuizUpdate(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const quizId = req.params.id as string;

    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: {
                questions: { orderBy: { id: 'asc' } },
                classes: { select: { id: true, name: true } }
            }
        });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const allClasses = await prisma.class.findMany({
            where: { teacherId: teacher.id },
            select: { id: true, name: true },
            orderBy: { name: 'asc' }
        });

        res.json({ quiz, classes: allClasses });
    } catch (error) {
        console.error("Error fetching quiz for update:", error);
        res.status(500).json({ error: "Error loading quiz" });
    }
}

export async function deleteQuiz(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const quizId = req.params.id as string;

    try {
        const quiz = await prisma.quiz.findUnique({ where: { id: quizId, teacherId: teacher.id } });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        await prisma.$transaction([
            prisma.submission.deleteMany({ where: { quizId } }),
            prisma.question.deleteMany({ where: { quizId } }),
            prisma.quiz.delete({ where: { id: quizId } })
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting quiz:", error);
        res.status(500).json({ error: "Error deleting quiz" });
    }
}

export async function releaseQuizResults(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const quizId = req.params.id as string;

    try {
        const quiz = await prisma.quiz.findUnique({ where: { id: quizId, teacherId: teacher.id } });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        await prisma.quiz.update({
            where: { id: quizId },
            data: { showResults: true }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error releasing quiz results:", error);
        res.status(500).json({ error: "Error releasing quiz results" });
    }
}

export async function uploadQuestionImage(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const quizId = req.params.id as string;
    const { questionIndex } = req.body;

    try {
        if (quizId && quizId !== 'new') {
            const quiz = await prisma.quiz.findUnique({ where: { id: quizId, teacherId: teacher.id } });
            if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        let imageUrl: string;
        try {
            imageUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
        } catch (uploadError) {
            console.error("Cloudinary upload error:", uploadError);
            return res.status(500).json({ error: 'Failed to upload image' });
        }

        res.json({ imageUrl, questionIndex: parseInt(questionIndex) });
    } catch (error) {
        console.error("Error uploading question image:", error);
        res.status(500).json({ error: "Error uploading image" });
    }
}
