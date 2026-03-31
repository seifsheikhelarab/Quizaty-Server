import jwt from 'jsonwebtoken';
import prisma from '../../prisma.js';
import { addOrMoveStudentToClass } from '../../services/class.js';
import type { Request, Response } from 'express';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';



export async function joinClass(req: Request, res: Response) {
    const classId = req.params.id;
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: string, role: string };

        if (decoded.role !== 'student') {
            return res.status(403).json({ error: 'Only students can join classes.' });
        }

        const student = await prisma.student.findUnique({ where: { id: decoded.id } });

        if (!student) {
            return res.status(401).json({ error: 'Student not found' });
        }

        const classData = await prisma.class.findUnique({
            where: { id: classId as string }
        });

        if (!classData) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Check if student is already in this class
        if (student.classId === classId) {
            return res.json({ success: true, message: 'Already a member of this class', student });
        }

        const updatedStudent = await addOrMoveStudentToClass(classData.id, classData.name, student.name, student.phone);

        res.json({ success: true, student: updatedStudent });
    } catch (error) {
        logger.error(`API Join Class error: ${error}`);
        res.status(500).json({ error: 'Failed to join class' });
    }
}