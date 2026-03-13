import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const authenticateTeacherAPI = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string, role: string, assistantId?: string };
        if (decoded.role !== 'teacher') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const teacher = await prisma.teacher.findUnique({ where: { id: decoded.id } });
        if (!teacher) return res.status(401).json({ error: 'User not found' });
        
        const reqAny = req as any;
        reqAny.teacher = teacher;
        if (decoded.assistantId) {
            reqAny.assistantId = decoded.assistantId;
            reqAny.isAssistant = true;
        } else {
            reqAny.isAssistant = false;
        }
        
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

export const authenticateStudentAPI = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string, role: string };
        if (decoded.role !== 'student') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const student = await prisma.student.findUnique({ where: { id: decoded.id } });
        if (!student) return res.status(401).json({ error: 'User not found' });
        (req as any).student = student;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};
