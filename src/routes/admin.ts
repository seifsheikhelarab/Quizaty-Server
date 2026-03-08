import { Router } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma.js';
import { authenticateAdmin, requireSuperAdmin } from '../middleware.js';

const router = Router();
const ITEMS_PER_PAGE = 15;

router.use(authenticateAdmin);

// --- Dashboard ---
router.get('/dashboard', async (req, res) => {
    const admin = (req as any).admin;
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

// --- Students ---
router.get('/students', async (req, res) => {
    const admin = (req as any).admin;
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
    const admin = (req as any).admin;
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
        if (!student) return res.status(404).send('Student not found');

        let bestScore: number | null = null;
        let worstScore: number | null = null;
        let totalPct = 0;
        let valid = 0;

        student.submissions.forEach(sub => {
            if (sub.submittedAt && sub.quiz.totalMarks > 0) {
                const pct = (sub.score / sub.quiz.totalMarks) * 100;
                if (bestScore === null || pct > bestScore) bestScore = pct;
                if (worstScore === null || pct < worstScore) worstScore = pct;
                totalPct += pct;
                valid++;
            }
        });

        const analysis = {
            bestScore: bestScore !== null ? (bestScore as number).toFixed(1) + '%' : 'N/A',
            worstScore: worstScore !== null ? (worstScore as number).toFixed(1) + '%' : 'N/A',
            avgScore: valid > 0 ? (totalPct / valid).toFixed(1) + '%' : 'N/A',
            totalSubmissions: student.submissions.length,
            completedSubmissions: student.submissions.filter(s => s.submittedAt).length
        };

        res.render('admin/student_profile', {
            title: student.name,
            admin, student, analysis,
            layout: false
        });
    } catch (error) {
        console.error("Admin student profile error:", error);
        res.status(500).send("Error loading student profile");
    }
});

// --- Teachers ---
router.get('/teachers', async (req, res) => {
    const admin = (req as any).admin;
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
    const admin = (req as any).admin;
    try {
        const teacher = await prisma.teacher.findUnique({
            where: { id: req.params.id },
            include: {
                quizzes: { orderBy: { createdAt: 'desc' }, take: 10, include: { _count: { select: { submissions: true, questions: true } } } },
                classes: { include: { _count: { select: { students: true } } }, orderBy: { name: 'asc' } },
                subscriptions: { orderBy: { createdAt: 'desc' } }
            }
        });
        if (!teacher) return res.status(404).send('Teacher not found');

        const totalStudents = teacher.classes.reduce((sum, c) => sum + (c as any)._count.students, 0);
        const activeSubscription = teacher.subscriptions.find(s => s.status === 'active');

        res.render('admin/teacher_profile', {
            title: teacher.name || teacher.email,
            admin, teacher, totalStudents, activeSubscription,
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
            expiresAt.setMonth(expiresAt.getMonth() + (parseInt(months) || 1));
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
                base.setMonth(base.getMonth() + (parseInt(months) || 1));
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

// --- Quizzes ---
router.get('/quizzes', async (req, res) => {
    const admin = (req as any).admin;
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

// --- Classes ---
router.get('/classes/:id', async (req, res) => {
    const admin = (req as any).admin;
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

// --- Subscriptions ---
router.get('/subscriptions', async (req, res) => {
    const admin = (req as any).admin;
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

// --- Invite Admin (Super Admin Only) ---
router.get('/invite', requireSuperAdmin, (req, res) => {
    const admin = (req as any).admin;
    res.render('admin/invite', { title: 'دعوة مدير جديد', admin, error: null, success: null, layout: false });
});

router.post('/invite', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).admin;
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

        const hashedPassword = await bcrypt.hash(password, 10);
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
