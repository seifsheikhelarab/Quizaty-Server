import express, { type Request } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';
import { config } from '../config.js';

export interface StudentRequest extends Request {
    student: {
        id: string;
        name: string;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        telegramId: string | null;
        parentPhone: string | null;
        classId: string | null;
        shortCode: string | null;
    }
}

export interface TeacherRequest extends Request {
    teacher: {
        id: string;
        email: string;
        name: string | null;
        phone: string | null;
        createdAt: Date;
        updatedAt: Date;
    }
    assistantId: string | undefined
    isAssistant: boolean | undefined
}

export const authenticateTeacherAPI = async (req: Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.token;
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: string, role: string, assistantId?: string };
        if (decoded.role !== 'teacher') {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const teacher = await prisma.teacher.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                createdAt: true,
                updatedAt: true
            }
        });
        if (!teacher) {
            res.status(401).json({ error: 'User not found' });
            return;
        }

        const teacherReq = req as TeacherRequest;
        teacherReq.teacher = teacher;
        if (decoded.assistantId) {
            teacherReq.assistantId = decoded.assistantId;
            teacherReq.isAssistant = true;
        } else {
            teacherReq.isAssistant = false;
        }

        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
        console.error(error);
    }
};

export const authenticateStudentAPI = async (req: Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.token;
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: string, role: string };
        if (decoded.role !== 'student') {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const student = await prisma.student.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                name: true,
                phone: true,
                createdAt: true,
                updatedAt: true,
                telegramId: true,
                parentPhone: true,
                classId: true,
                shortCode: true
            }
        });
        if (!student) {
            res.status(401).json({ error: 'User not found' });
            return;
        }
        const studentReq = req as StudentRequest;
        studentReq.student = student;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
        console.error(error);
    }
};
