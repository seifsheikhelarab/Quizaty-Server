import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

router.get('/login', (req, res) => {
    res.render('auth/login', { title: 'Login', error: null });
});

router.get('/register', (req, res) => {
    res.render('auth/register', { title: 'Register', error: null });
});

router.post('/register', async (req, res) => {
    const { role, password, name, phone, email, parentPhone } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        let user;

        if (role === 'teacher') {
            user = await prisma.teacher.create({
                data: { email, password: hashedPassword, name, phone }
            });
            // Start free trial subscription for new teachers
            const now = new Date();
            const expiresAt = new Date(now.getTime());
            expiresAt.setDate(expiresAt.getDate() + 7);
            await prisma.subscription.create({
                data: {
                    teacherId: user.id,
                    tier: 'FREE_TRIAL',
                    status: 'active',
                    startedAt: now,
                    expiresAt
                }
            });
            const token = jwt.sign({ id: user.id, role: 'teacher' }, JWT_SECRET);
            res.cookie('token', token, { httpOnly: true });
            return res.redirect('/teacher/dashboard');

        } else if (role === 'student') {
            user = await prisma.student.findUnique({ where: { phone } });

            if (user) {
                if (user.password) {
                    return res.render('auth/register', { title: 'Register', error: 'An account with this phone number already exists.' });
                }
                user = await prisma.student.update({
                    where: { id: user.id },
                    data: { password: hashedPassword, name: name || user.name, parentPhone }
                });
            } else {
                user = await prisma.student.create({
                    data: { name, phone, password: hashedPassword, parentPhone }
                });
            }

            const token = jwt.sign({ id: user.id, role: 'student' }, JWT_SECRET);
            res.cookie('token', token, { httpOnly: true });
            return res.redirect('/student/dashboard');
        } else {
            return res.render('auth/register', { title: 'Register', error: 'Invalid role selected' });
        }

    } catch (error: any) {
        console.error("Registration error:", error);
        res.render('auth/register', { title: 'Register', error: 'Registration failed. Please try again.' });
    }
});

router.post('/login', async (req, res) => {
    const { role, password, email, phone } = req.body;

    try {
        if (role === 'teacher') {
            const teacher = await prisma.teacher.findUnique({ where: { email } });
            if (!teacher || !(await bcrypt.compare(password, teacher.password))) {
                return res.render('auth/login', { title: 'Login', error: 'Invalid credentials' });
            }
            const token = jwt.sign({ id: teacher.id, role: 'teacher' }, JWT_SECRET);
            res.cookie('token', token, { httpOnly: true });
            return res.redirect('/teacher/dashboard');

        } else if (role === 'student') {
            const student = await prisma.student.findUnique({ where: { phone } });
            if (!student || !student.password || !(await bcrypt.compare(password, student.password))) {
                return res.render('auth/login', { title: 'Login', error: 'Invalid phone number or password' });
            }
            const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET);
            res.cookie('token', token, { httpOnly: true });
            return res.redirect('/student/dashboard');

        } else {
            return res.render('auth/login', { title: 'Login', error: 'Invalid role selected' });
        }
    } catch (error: any) {
        console.error("Login error:", error);
        res.render('auth/login', { title: 'Login', error: 'Login failed. Please try again.' });
    }
});

router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/auth/login');
});

// --- Admin Auth ---
router.get('/admin/login', (req, res) => {
    res.render('admin/login', { title: 'تسجيل دخول المدير', error: null, layout: false });
});

router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.render('admin/login', { title: 'تسجيل دخول المدير', error: 'بيانات الاعتماد غير صحيحة', layout: false });
        }
        const token = jwt.sign({ id: admin.id, role: admin.role }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('admin_token', token, { httpOnly: true });
        return res.redirect('/admin/dashboard');
    } catch (error: any) {
        console.error("Admin login error:", error);
        res.render('admin/login', { title: 'تسجيل دخول المدير', error: 'فشل تسجيل الدخول. حاول مرة أخرى.', layout: false });
    }
});

router.get('/admin/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.redirect('/auth/admin/login');
});

export default router;
