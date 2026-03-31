import type { Request, Response } from "express";
import type { TeacherRequest } from "../../middleware/apiAuth.js";
import prisma from "../../prisma.js";
import { getActiveSubscriptionForTeacher, checkStudentLimit, getPlanLimits, type SubscriptionTier } from "../../services/subscription.js";

export async function getClasses(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    try {
        const classes = await prisma.class.findMany({
            where: { teacherId: teacher.id },
            include: {
                _count: { select: { students: true, quizzes: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ classes });
    } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).json({ error: "Error loading classes" });
    }
}

export async function getClassDetails(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const classId = req.params.id as string;

    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        const classData = await prisma.class.findUnique({
            where: { id: classId, teacherId: teacher.id },
            include: {
                students: { orderBy: { name: 'asc' } },
                quizzes: {
                    orderBy: { startTime: 'desc' },
                    take: 10,
                    include: { _count: { select: { submissions: true } } }
                }
            }
        });
        if (!classData) return res.status(404).json({ error: 'Class not found' });
        res.json({ classData, limits });
    } catch (error) {
        console.error("Error fetching class details:", error);
        res.status(500).json({ error: "Error loading class" });
    }
}

export async function createClass(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const { name, description, studentPhones } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Class name is required' });
    
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;

        const classData = await prisma.$transaction(async (tx) => {
            const newClass = await tx.class.create({
                data: { name: name.trim(), description: description?.trim() || null, teacherId: teacher.id }
            });
            
            if (studentPhones && typeof studentPhones === 'string') {
                const phones = studentPhones.split('\n').map((p: string) => p.trim()).filter(Boolean);
                for (const phone of phones) {
                    const studentCheck = await checkStudentLimit(teacher.id, tier);
                    if (!studentCheck.allowed) break;

                    const student = await tx.student.findUnique({ where: { phone } });
                    if (student) {
                        await tx.student.update({ where: { id: student.id }, data: { classId: newClass.id } });
                    } else {
                        await tx.student.create({ data: { name: 'Student', phone, classId: newClass.id } });
                    }
                }
            }
            return newClass;
        });
        res.json({ classData });
    } catch (error) {
        console.error("Error creating class:", error);
        res.status(500).json({ error: "Error creating class" });
    }
}

export async function updateClass(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const classId = req.params.id as string;
    const { name, description } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Class name is required' });
    
    try {
        const classData = await prisma.class.update({
            where: { id: classId, teacherId: teacher.id },
            data: { name: name.trim(), description: description?.trim() || null }
        });
        res.json({ classData });
    } catch (error) {
        console.error("Error updating class:", error);
        res.status(500).json({ error: "Error updating class" });
    }
}

export async function deleteClass(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const classId = req.params.id as string;

    try {
        await prisma.$transaction([
            prisma.student.updateMany({ where: { classId }, data: { classId: null, shortCode: null } }),
            prisma.class.delete({ where: { id: classId, teacherId: teacher.id } })
        ]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting class:", error);
        res.status(500).json({ error: "Error deleting class" });
    }
}

export async function addStudent(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const classId = req.params.id as string;
    const { name, phone } = req.body;

    try {
        const classData = await prisma.class.findUnique({ where: { id: classId, teacherId: teacher.id } });
        if (!classData) return res.status(404).json({ error: 'Class not found' });
        if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const studentCheck = await checkStudentLimit(teacher.id, tier);
        if (!studentCheck.allowed) {
            return res.status(403).json({
                error: `لقد وصلت إلى الحد الأقصى لعدد الطلاب (${studentCheck.max}). يرجى ترقية باقتك.`,
                code: 'STUDENT_LIMIT_REACHED'
            });
        }

        let student = await prisma.student.findUnique({
            where: { phone },
            select: { id: true, name: true, phone: true, classId: true, shortCode: true, createdAt: true, updatedAt: true }
        });
        if (student) {
            student = await prisma.student.update({
                where: { id: student.id },
                data: { classId },
                select: { id: true, name: true, phone: true, classId: true, shortCode: true, createdAt: true, updatedAt: true }
            });
        } else {
            student = await prisma.student.create({
                data: { name, phone, classId },
                select: { id: true, name: true, phone: true, classId: true, shortCode: true, createdAt: true, updatedAt: true }
            });
        }
        res.json({ student });
    } catch (error) {
        console.error("Error adding student:", error);
        res.status(500).json({ error: "Error adding student" });
    }
}

export async function removeStudent(req: Request, res: Response) {
    const teacher = (req as TeacherRequest).teacher;
    const classId = req.params.id as string;
    const studentId = req.params.studentId as string;

    try {
        const classData = await prisma.class.findUnique({ where: { id: classId, teacherId: teacher.id } });
        if (!classData) return res.status(404).json({ error: 'Class not found' });

        await prisma.student.update({
            where: { id: studentId },
            data: { classId: null, shortCode: null }
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Error removing student:", error);
        res.status(500).json({ error: "Error removing student" });
    }
}
