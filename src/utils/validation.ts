import { z } from 'zod';

export const loginSchema = z.object({
    role: z.enum(['teacher', 'student']),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    password: z.string().min(1, 'Password is required'),
}).refine(data => (data.role === 'teacher' ? data.email : data.phone), {
    message: 'Email is required for teacher, phone for student',
    path: ['email']
});

export const registerSchema = z.object({
    role: z.enum(['teacher', 'student']),
    name: z.string().min(1, 'Name is required').optional(),
    email: z.string().email().optional(),
    phone: z.string().min(10, 'Valid phone number required').optional(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    parentPhone: z.string().optional(),
}).refine(data => (data.role === 'teacher' ? data.email : data.phone), {
    message: 'Email is required for teacher, phone for student',
    path: ['email']
});

export const createClassSchema = z.object({
    name: z.string().min(1, 'Class name is required'),
    description: z.string().optional(),
});

export const addStudentSchema = z.object({
    name: z.string().min(1, 'Student name is required'),
    phone: z.string().min(10, 'Valid phone number required'),
});

export const createQuizSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    duration: z.number().int().min(1).max(180),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    classIds: z.array(z.string()).min(1, 'At least one class is required'),
    questions: z.array(z.object({
        questionText: z.string().min(1, 'Question text is required'),
        options: z.array(z.string()).length(4, 'Exactly 4 options required'),
        correctOption: z.number().int().min(0).max(3),
        marks: z.number().int().positive().optional(),
    })).min(1, 'At least one question is required'),
});

export const updateQuizSchema = z.object({
    title: z.string().min(1, 'Title is required').optional(),
    description: z.string().optional(),
    duration: z.number().int().min(1).max(180).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    questions: z.array(z.object({
        id: z.string().optional(),
        questionText: z.string().min(1, 'Question text is required'),
        options: z.array(z.string()).length(4, 'Exactly 4 options required'),
        correctOption: z.number().int().min(0).max(3),
        marks: z.number().int().positive().optional(),
    })).optional(),
});

export const submitQuizSchema = z.object({
    answers: z.record(z.string(), z.number()),
});

export const inviteAssistantSchema = z.object({
    email: z.string().email('Valid email required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    name: z.string().min(1, 'Name is required'),
});

export function validateBody<T>(schema: z.ZodSchema<T>) {
    return (data: unknown): { success: true; data: T } | { success: false; error: string } => {
        const result = schema.safeParse(data);
        if (!result.success) {
            const errors = result.error.issues.map(e => e.message).join(', ');
            return { success: false, error: errors };
        }
        return { success: true, data: result.data };
    };
}
