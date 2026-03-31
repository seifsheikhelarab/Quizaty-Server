import type { Request, Response } from "express";
import type { TeacherRequest } from "../../middleware/apiAuth.js";
import type { SubscriptionTier } from "@prisma/client";
import prisma from "../../prisma.js";
import { getActiveSubscriptionForTeacher, getPlanLimits, getPlanInfo } from "../../services/subscription.js";

export async function getDashboard(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;

    try {
        const [quizzesCount, studentsCount, submissionsCount, classesCount, questionBankCount, assistantsCount, activeSubscription] = await Promise.all([
            prisma.quiz.count({ where: { teacherId: teacher.id } }),
            prisma.student.count({ where: { class: { teacherId: teacher.id } } }),
            prisma.submission.count({ where: { quiz: { teacherId: teacher.id } } }),
            prisma.class.count({ where: { teacherId: teacher.id } }),
            prisma.bankQuestion.count({ where: { teacherId: teacher.id } }),
            prisma.assistant.count({ where: { teacherId: teacher.id } }),
            getActiveSubscriptionForTeacher(teacher.id)
        ]);

        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);
        const planInfo = getPlanInfo(tier);

        res.json({
            stats: {
                quizzes: quizzesCount,
                students: studentsCount,
                submissions: submissionsCount,
                classes: classesCount
            },
            subscription: activeSubscription,
            limits,
            planInfo,
            questionBankCount,
            assistantsCount,
            usage: {
                students: { current: studentsCount, max: limits.maxTotalStudents },
                quizzes: { current: quizzesCount, max: limits.maxQuizzes },
            }
        });
    } catch (error) {
        console.error("Dashboard API error:", error);
        res.status(500).json({ error: "Error loading dashboard" });
    }
}
