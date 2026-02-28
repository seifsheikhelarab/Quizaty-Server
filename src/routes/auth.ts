import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { UnauthorizedError, BadRequestError } from '../utils/errors';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

router.get('/login', (req, res) => {
    res.render('auth/login', { title: 'Login', error: null });
});

router.get('/signup', (req, res) => {
    res.render('auth/signup', { title: 'Signup', error: null });
});

router.post('/signup', async (req, res) => {
    const { email, password, name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const teacher = await prisma.teacher.create({
            data: { email, password: hashedPassword, name }
        });
        const token = jwt.sign({ id: teacher.id }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/teacher/dashboard');
    } catch (error: any) {
        res.render('auth/signup', { title: 'Signup', error: 'Email already exists' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const teacher = await prisma.teacher.findUnique({ where: { email } });
    if (!teacher || !(await bcrypt.compare(password, teacher.password))) {
        return res.render('auth/login', { title: 'Login', error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: teacher.id }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/teacher/dashboard');
});

router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/auth/login');
});

export default router;
