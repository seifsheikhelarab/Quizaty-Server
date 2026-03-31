import type { Request, Response } from 'express';
import type { AdminRequest } from '../middleware.js';
import prisma from '../prisma.js';
import { getAllPlans, getPlanInfo, type SubscriptionTier } from '../services/subscription.js';
import { ITEMS_PER_PAGE } from '../constants.js';

function getAdmin(req: Request): AdminRequest {
    return req as unknown as AdminRequest;
}

interface StudentWithRelations {
    name: string;
    submissions: Array<{
        submittedAt: Date | null;
        score: number;
        quiz: { totalMarks: number };
    }>;
}

interface TeacherWithRelations {
    name: string | null;
    email: string;
    classes: Array<{ _count: { students: number } }>;
    subscriptions: Array<{ status: string; tier: string }>;
}

export async function getDashboard(req: Request, res: Response) {
    const admin = getAdmin(req).admin;
    try {
        const [teachersCount, studentsCount, quizzesCount, classesCount, subscriptionsCount] = await Promise.all([
            prisma.teacher.count(),
            prisma.student.count(),
            prisma.quiz.count(),
            prisma.class.count(),
            prisma.subscription.count()
        ]);

        res.render('admin/dashboard', {
            title: 'لوحة تحكم المدير',
            admin,
            stats: {
                teachers: teachersCount,
                students: studentsCount,
                quizzes: quizzesCount,
                classes: classesCount,
                subscriptions: subscriptionsCount
            },
            layout: false
        });
    } catch (error) {
        console.error("Admin dashboard error:", error);
        res.status(500).send("Error loading admin dashboard");
    }
}

export async function getStudents(req: Request, res: Response) {
    const admin = getAdmin(req).admin;
    const page = parseInt(req.query.page as string) || 1;
    const q = (req.query.q as string || '').trim();

    try {
        const where = q ? {
            OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { phone: { contains: q } }
            ]
        } : {};

        const [students, total] = await Promise.all([
            prisma.student.findMany({
                where,
                include: { class: true },
                skip: (page - 1) * ITEMS_PER_PAGE,
                take: ITEMS_PER_PAGE,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.student.count({ where })
        ]);

        const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

        res.render('admin/students', {
            title: 'الطلاب',
            admin, students, page, totalPages, total, q,
            layout: false
        });
    } catch (error) {
        console.error("Admin students error:", error);
        res.status(500).send("Error loading students");
    }
}

export async function getStudentDetails(req: Request, res: Response) {
    const admin = getAdmin(req).admin;
    const studentId = String(req.params.id);

    try {
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: {
                class: { include: { teacher: true } },
                submissions: {
                    include: { quiz: { include: { teacher: true } } },
                    orderBy: { startedAt: 'desc' }
                }
            }
        });

        if (!student) return res.status(404).send('Student not found');

        const studentTyped = student as unknown as StudentWithRelations;

        let bestScore: number | null = null;
        let worstScore: number | null = null;
        let totalPct: number = 0;
        let valid: number = 0;

        studentTyped.submissions.forEach((sub: StudentWithRelations['submissions'][number]) => {
            if (sub.submittedAt && sub.quiz.totalMarks > 0) {
                const pct = (sub.score / sub.quiz.totalMarks) * 100;
                if (bestScore === null || pct > bestScore) bestScore = pct;
                if (worstScore === null || pct < worstScore) worstScore = pct;
                totalPct += pct;
                valid++;
            }
        });

        const best: number = bestScore ?? 0;
        const worst: number = worstScore ?? 0;
        const avg: number = valid > 0 ? totalPct / valid : 0;

        const analysis = {
            bestScore: bestScore !== null ? best.toFixed(1) + '%' : 'N/A',
            worstScore: worstScore !== null ? worst.toFixed(1) + '%' : 'N/A',
            avgScore: valid > 0 ? avg.toFixed(1) + '%' : 'N/A',
            totalSubmissions: studentTyped.submissions.length,
            completedSubmissions: studentTyped.submissions.filter((s: StudentWithRelations['submissions'][number]) => s.submittedAt).length
        };

        res.render('admin/student_profile', {
            title: studentTyped.name,
            admin, student: studentTyped, analysis,
            layout: false
        });
    } catch (error) {
        console.error("Admin student profile error:", error);
        res.status(500).send("Error loading student profile");
    }
}

export async function getTeachers(req: Request, res: Response) {
    const admin = getAdmin(req).admin;
    const page = parseInt(req.query.page as string) || 1;
    const q = (req.query.q as string || '').trim();

    try {
        const where = q ? {
            OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } }
            ]
        } : {};

        const [teachers, total] = await Promise.all([
            prisma.teacher.findMany({
                where,
                include: {
                    _count: { select: { quizzes: true, classes: true, subscriptions: true } }
                },
                skip: (page - 1) * ITEMS_PER_PAGE,
                take: ITEMS_PER_PAGE,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.teacher.count({ where })
        ]);

        const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

        res.render('admin/teachers', {
            title: 'المعلمون',
            admin, teachers, page, totalPages, total, q,
            layout: false
        });
    } catch (error) {
        console.error("Admin teachers error:", error);
        res.status(500).send("Error loading teachers");
    }
}

export async function getTeacherDetails(req: Request, res: Response) {
    const admin = getAdmin(req).admin;
    const teacherId = String(req.params.id);

    try {
        const teacher = await prisma.teacher.findUnique({
            where: { id: teacherId },
            include: {
                quizzes: { orderBy: { createdAt: 'desc' }, take: 10, include: { _count: { select: { submissions: true, questions: true } } } },
                classes: { include: { _count: { select: { students: true } } }, orderBy: { name: 'asc' } },
                subscriptions: { orderBy: { createdAt: 'desc' } }
            }
        });

        if (!teacher) return res.status(404).send('Teacher not found');

        const teacherTyped = teacher as unknown as TeacherWithRelations;

        const totalStudents = teacherTyped.classes.reduce((sum: number, c: TeacherWithRelations['classes'][number]) => sum + c._count.students, 0);
        const activeSubscription = teacherTyped.subscriptions.find((s: TeacherWithRelations['subscriptions'][number]) => s.status === 'active');
        const activePlanInfo = activeSubscription ? getPlanInfo(activeSubscription.tier as SubscriptionTier) : getPlanInfo('FREE_TRIAL');
        const plans = getAllPlans();

        res.render('admin/teacher_profile', {
            title: teacherTyped.name || teacherTyped.email,
            admin, teacher, totalStudents, activeSubscription, activePlanInfo, plans,
            layout: false
        });
    } catch (error) {
        console.error("Admin teacher profile error:", error);
        res.status(500).send("Error loading teacher profile");
    }
}

export async function manageSubscription(req: Request, res: Response) {
    const { action, tier, months } = req.body;
    const teacherId = String(req.params.id);

    try {
        if (action === 'upgrade') {
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + (parseInt(String(months)) || 1));
            await prisma.subscription.create({
                data: {
                    teacherId,
                    tier: (tier || 'PREMIUM'),
                    status: 'active',
                    startedAt: new Date(),
                    expiresAt
                }
            });
        } else if (action === 'cancel') {
            await prisma.subscription.updateMany({
                where: { teacherId, status: 'active' },
                data: { status: 'cancelled' }
            });
        } else if (action === 'extend') {
            const active = await prisma.subscription.findFirst({
                where: { teacherId, status: 'active' }
            });
            if (active) {
                const base = active.expiresAt ? new Date(active.expiresAt) : new Date();
                base.setMonth(base.getMonth() + (parseInt(months as string) || 1));
                await prisma.subscription.update({
                    where: { id: active.id },
                    data: { expiresAt: base }
                });
            }
        }
        res.redirect(`/admin/teachers/${teacherId}`);
    } catch (error) {
        console.error("Subscription action error:", error);
        res.status(500).send("Error processing subscription action");
    }
}

export async function getQuizzes(req: Request, res: Response) {
    const admin = getAdmin(req).admin;
    const page = parseInt(req.query.page as string) || 1;
    const q = (req.query.q as string || '').trim();

    try {
        const where = q ? {
            title: { contains: q, mode: 'insensitive' as const }
        } : {};

        const [quizzes, total] = await Promise.all([
            prisma.quiz.findMany({
                where,
                include: {
                    teacher: true,
                    _count: { select: { questions: true, submissions: true } }
                },
                skip: (page - 1) * ITEMS_PER_PAGE,
                take: ITEMS_PER_PAGE,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.quiz.count({ where })
        ]);

        const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

        res.render('admin/quizzes', {
            title: 'الاختبارات',
            admin, quizzes, page, totalPages, total, q,
            layout: false
        });
    } catch (error) {
        console.error("Admin quizzes error:", error);
        res.status(500).send("Error loading quizzes");
    }
}

export async function getClassDetails(req: Request, res: Response) {
    const admin = getAdmin(req).admin;
    const classId = String(req.params.id);

    try {
        const classData = await prisma.class.findUnique({
            where: { id: classId },
            include: {
                teacher: true,
                students: { orderBy: { name: 'asc' } },
                quizzes: { orderBy: { startTime: 'desc' }, take: 10 }
            }
        });
        if (!classData) return res.status(404).send('Class not found');

        res.render('admin/class_profile', {
            title: classData.name,
            admin, classData,
            layout: false
        });
    } catch (error) {
        console.error("Admin class profile error:", error);
        res.status(500).send("Error loading class profile");
    }
}

export async function getSubscriptions(req: Request, res: Response) {
    const admin = getAdmin(req).admin;
    const page = parseInt(req.query.page as string) || 1;

    try {
        const [subscriptions, total] = await Promise.all([
            prisma.subscription.findMany({
                include: { teacher: true },
                skip: (page - 1) * ITEMS_PER_PAGE,
                take: ITEMS_PER_PAGE,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.subscription.count()
        ]);

        const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

        res.render('admin/subscriptions', {
            title: 'الاشتراكات',
            admin, subscriptions, page, totalPages, total,
            layout: false
        });
    } catch (error) {
        console.error("Admin subscriptions error:", error);
        res.status(500).send("Error loading subscriptions");
    }
}
