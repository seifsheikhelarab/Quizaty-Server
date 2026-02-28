import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Auth Middleware
export const authenticateTeacher = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.token;
    if (!token) return res.redirect('/auth/login');

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
        const teacher = await prisma.teacher.findUnique({ where: { id: decoded.id } });
        if (!teacher) return res.redirect('/auth/login');
        (req as any).teacher = teacher;
        next();
    } catch (error) {
        res.clearCookie('token');
        res.redirect('/auth/login');
    }
};
