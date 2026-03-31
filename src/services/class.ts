import prisma from '../prisma.js';

export const SHORT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateShortCodeForClass = async (classId: string): Promise<string> => {
    // Try a few times to generate a unique short code within this class
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = Array.from({ length: 4 }, () => SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)]).join('');
        const existing = await prisma.student.findFirst({
            where: { classId, shortCode: code }
        });
        if (!existing) {
            return code;
        }
    }
    throw new Error('Unable to generate unique short code for class');
};

export const addOrMoveStudentToClass = async (classId: string, className: string, name: string, phone: string) => {
    let student = await prisma.student.findUnique({ where: { phone } });

    if (student) {
        const data: Record<string, unknown> = { classId };
        if (!student.shortCode || student.classId !== classId) {
            const shortCode = await generateShortCodeForClass(classId);
            data.shortCode = shortCode;
        }
        student = await prisma.student.update({
            where: { id: student.id },
            data
        });
    } else {
        const shortCode = await generateShortCodeForClass(classId);
        student = await prisma.student.create({
            data: {
                name,
                phone,
                classId,
                shortCode
            }
        });
    }


    return student;
};
