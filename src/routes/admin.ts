import { Router } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma.js';
import { authenticateAdmin, requireSuperAdmin, type AdminRequest } from '../middleware.js';
import { getAllPlans, getPlanInfo, type SubscriptionTier } from '../services/subscription.js';
import { SALT_ROUNDS, ITEMS_PER_PAGE } from '../constants.js';

interface StudentWithRelations {
    name: string | null;
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

const router = Router();

router.use(authenticateAdmin);

router.get('/dashboard', async (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
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
});

router.get('/students', async (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
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
});

router.get('/students/:id', async (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
    try {
        const student = await prisma.student.findUnique({
            where: { id: req.params.id },
            include: {
                class: { include: { teacher: true } },
                submissions: {
                    include: { quiz: { include: { teacher: true } } },
                    orderBy: { startedAt: 'desc' }
                }
            }
        });

        const studentTyped = student as unknown as StudentWithRelations;

        if (!studentTyped) return res.status(404).send('Student not found');

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
            title: studentTyped.name ?? 'Student',
            admin, student: studentTyped, analysis,
            layout: false
        });
    } catch (error) {
        console.error("Admin student profile error:", error);
        res.status(500).send("Error loading student profile");
    }
});

router.get('/teachers', async (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
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
});

router.get('/teachers/:id', async (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
    try {
        const teacher = await prisma.teacher.findUnique({
            where: { id: req.params.id },
            include: {
                quizzes: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: { _count: { select: { submissions: true, questions: true } } }
                },
                classes: {
                    include: { _count: { select: { students: true } } },
                    orderBy: { name: 'asc' }
                },
                subscriptions: { orderBy: { createdAt: 'desc' } }
            }
        });

        const teacherTyped = teacher as unknown as TeacherWithRelations;
        if (!teacherTyped) return res.status(404).send('Teacher not found');

        const totalStudents = teacherTyped.classes.reduce((sum: number, c: TeacherWithRelations['classes'][number]) => sum + c._count.students, 0);
        const activeSubscription = teacherTyped.subscriptions.find((s: TeacherWithRelations['subscriptions'][number]) => s.status === 'active');
        const activePlanInfo = activeSubscription ? getPlanInfo(activeSubscription.tier as SubscriptionTier) : getPlanInfo('FREE_TRIAL');
        const plans = getAllPlans();

        res.render('admin/teacher_profile', {
            title: teacherTyped.name || teacherTyped.email,
            admin, teacher: teacherTyped, totalStudents, activeSubscription, activePlanInfo, plans,
            layout: false
        });
    } catch (error) {
        console.error("Admin teacher profile error:", error);
        res.status(500).send("Error loading teacher profile");
    }
});

router.post('/teachers/:id/subscription', async (req, res) => {
    const { action, tier, months } = req.body;
    const teacherId = req.params.id;

    try {
        if (action === 'upgrade') {
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + (parseInt(months as string) || 1));
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
});

router.get('/quizzes', async (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
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
});

router.get('/classes/:id', async (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
    try {
        const classData = await prisma.class.findUnique({
            where: { id: req.params.id },
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
});

router.get('/subscriptions', async (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
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
});

router.get('/invite', requireSuperAdmin, (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
    res.render('admin/invite', { title: 'دعوة مدير جديد', admin, error: null, success: null, layout: false });
});

router.post('/invite', requireSuperAdmin, async (req, res) => {
    const admin = (req as unknown as AdminRequest).admin;
    const { email, password, name, role } = req.body;

    try {
        const existing = await prisma.admin.findUnique({ where: { email } });
        if (existing) {
            return res.render('admin/invite', {
                title: 'دعوة مدير جديد', admin,
                error: 'هذا البريد الإلكتروني مسجل بالفعل', success: null,
                layout: false
            });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        await prisma.admin.create({
            data: { email, password: hashedPassword, name, role: role || 'ADMIN' }
        });

        res.render('admin/invite', {
            title: 'دعوة مدير جديد', admin,
            error: null, success: 'تم إنشاء حساب المدير بنجاح',
            layout: false
        });
    } catch (error) {
        console.error("Admin invite error:", error);
        res.render('admin/invite', {
            title: 'دعوة مدير جديد', admin,
            error: 'فشل إنشاء الحساب. حاول مرة أخرى.', success: null,
            layout: false
        });
    }
});

export default router;
