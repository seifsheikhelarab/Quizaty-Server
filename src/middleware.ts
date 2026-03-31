import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from './prisma.js';
import { config } from './config.js';

export type TeacherRequest = express.Request & { teacher: { id: string } };
export type StudentRequest = express.Request & { student: { id: string } };
export type AdminRequest = express.Request & { admin: { id: string; role: string } };

// Auth Middleware
export const authenticateTeacher = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.token;
    if (!token) return res.redirect('/auth/login');

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: string };
        const teacher = await prisma.teacher.findUnique({ where: { id: decoded.id } });
        if (!teacher) return res.redirect('/auth/login');
        
        (req as TeacherRequest).teacher = teacher;
        next();
    } catch {
        res.clearCookie('token');
        res.redirect('/auth/login');
    }
};

export const authenticateStudent = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.token;
    if (!token) return res.redirect('/auth/login');

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: string };
        const student = await prisma.student.findUnique({ where: { id: decoded.id } });
        if (!student) return res.redirect('/auth/login');
        
        (req as StudentRequest).student = student;
        next();
    } catch {
        res.clearCookie('token');
        res.redirect('/auth/login');
    }
};

export const authenticateAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.admin_token;
    if (!token) return res.redirect('/auth/admin/login');

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: string; role: string };
        const admin = await prisma.admin.findUnique({ where: { id: decoded.id } });
        if (!admin) return res.redirect('/auth/admin/login');
        
        (req as AdminRequest).admin = admin;
        next();
    } catch {
        res.clearCookie('admin_token');
        res.redirect('/auth/admin/login');
    }
};

export const requireSuperAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    
    const admin = (req as AdminRequest).admin;
    if (!admin || admin.role !== 'SUPER_ADMIN') {
        return res.status(403).send('Access denied. Super admin privileges required.');
    }
    next();
};