import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

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
            const token = jwt.sign({ id: user.id, role: 'teacher' }, JWT_SECRET, { expiresIn: '24h' });
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

            const token = jwt.sign({ id: user.id, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });
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
            const token = jwt.sign({ id: teacher.id, role: 'teacher' }, JWT_SECRET, { expiresIn: '24h' });
            res.cookie('token', token, { httpOnly: true });
            return res.redirect('/teacher/dashboard');

        } else if (role === 'student') {
            const student = await prisma.student.findUnique({ where: { phone } });
            if (!student || !student.password || !(await bcrypt.compare(password, student.password))) {
                return res.render('auth/login', { title: 'Login', error: 'Invalid phone number or password' });
            }
            const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });
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

export default router;
