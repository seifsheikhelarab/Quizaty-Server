import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../../prisma.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// GET /api/auth/me - Get current user info from token
router.get('/me', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string, role: string };
        let user;

        if (decoded.role === 'teacher') {
            user = await prisma.teacher.findUnique({
                where: { id: decoded.id },
                select: { id: true, email: true, name: true, phone: true }
            });
            // Support for assistant logins
            if ((decoded as any).assistantId) {
                const assistant = await prisma.assistant.findUnique({ where: { id: (decoded as any).assistantId } });
                if (assistant && user) {
                    user = { ...user, name: assistant.name, email: assistant.email, assistantId: assistant.id, isAssistant: true } as any;
                }
            }
        } else {
            user = await prisma.student.findUnique({
                where: { id: decoded.id },
                select: { id: true, name: true, phone: true }
            });
        }

        if (!user) return res.status(401).json({ error: 'User not found' });

        res.json({ user: { ...user, role: decoded.role } });
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { role, password, email, phone } = req.body;

    try {
        if (role === 'teacher') {
            const teacher = await prisma.teacher.findUnique({ where: { email } });
            if (teacher && (await bcrypt.compare(password, teacher.password))) {
                const token = jwt.sign({ id: teacher.id, role: 'teacher' }, JWT_SECRET);
                res.cookie('token', token, { httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' });
                return res.json({ user: { id: teacher.id, email: teacher.email, name: teacher.name, role: 'teacher' } });
            }

            // Check if it's an Assistant
            const assistant = await prisma.assistant.findUnique({ where: { email } });
            if (assistant && (await bcrypt.compare(password, assistant.password))) {
                const token = jwt.sign({ id: assistant.teacherId, assistantId: assistant.id, role: 'teacher' }, JWT_SECRET);
                res.cookie('token', token, { httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' });
                return res.json({ user: { id: assistant.teacherId, assistantId: assistant.id, email: assistant.email, name: assistant.name, role: 'teacher', isAssistant: true } });
            }

            return res.status(401).json({ error: 'Invalid credentials' });

        } else if (role === 'student') {
            const normalizedPhone = phone.startsWith('+') ? phone : (phone.startsWith('01') ? `+20${phone.substring(1)}` : phone);
            let student = await prisma.student.findUnique({ where: { phone } });
            if (!student) {
                // Secondary check for normalized phone or just a simple match check
                student = await prisma.student.findFirst({
                    where: {
                        OR: [
                            { phone: normalizedPhone },
                            { phone: phone.replace('+', '') }
                        ]
                    }
                });
            }
            
            if (!student || !student.password || !(await bcrypt.compare(password, student.password))) {
                return res.status(401).json({ error: 'Invalid phone number or password' });
            }
            const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET);
            res.cookie('token', token, { httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' });
            return res.json({ user: { id: student.id, name: student.name, phone: student.phone, role: 'student' } });

        } else {
            return res.status(400).json({ error: 'Invalid role selected' });
        }
    } catch (error: any) {
        console.error("API Login error:", error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { role, password, name, phone, email, parentPhone } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        let user;

        if (role === 'teacher') {
            user = await prisma.teacher.create({
                data: { email, password: hashedPassword, name, phone }
            });
            // Start free trial
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
            res.cookie('token', token, { httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' });
            return res.json({ user: { id: user.id, email: user.email, name: user.name, role: 'teacher' } });

        } else if (role === 'student') {
            user = await prisma.student.findUnique({ where: { phone } });

            if (user) {
                if (user.password) {
                    return res.status(400).json({ error: 'An account with this phone number already exists.' });
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
            res.cookie('token', token, { httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' });
            return res.json({ user: { id: user.id, name: user.name, phone: user.phone, role: 'student' } });
        } else {
            return res.status(400).json({ error: 'Invalid role selected' });
        }

    } catch (error: any) {
        console.error("API Registration error:", error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

export default router;
