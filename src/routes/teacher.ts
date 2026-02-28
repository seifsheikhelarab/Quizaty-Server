import { Router } from 'express';
import prisma from '../prisma';
import { authenticateTeacher } from '../middleware';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/' });

router.use(authenticateTeacher);

router.get('/dashboard', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizzes = await prisma.quiz.findMany({
        where: { teacherId: teacher.id },
        include: { _count: { select: { questions: true, submissions: true } } }
    });
    const studentsCount = await prisma.student.count();
    res.render('teacher/dashboard', { title: 'Dashboard', teacher, quizzes, studentsCount });
});

router.get('/students', async (req, res) => {
    const teacher = (req as any).teacher;
    const students = await prisma.student.findMany({
        orderBy: { createdAt: 'desc' }
    });
    res.render('teacher/students', { title: 'Students', teacher, students });
});

router.post('/students/add', async (req, res) => {
    const { name, phone, groupName } = req.body;
    await prisma.student.create({
        data: { name, phone, groupName }
    });
    res.redirect('/teacher/students');
});

router.post('/students/import', upload.single('csvFile'), async (req, res, next) => {
    if (!req.file) return res.status(400).send('No file uploaded');

    const students: any[] = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => students.push(data))
        .on('end', async () => {
            try {
                for (const student of students) {
                    await prisma.student.upsert({
                        where: { phone: student.phone },
                        update: { name: student.name, groupName: student.groupName },
                        create: { name: student.name, phone: student.phone, groupName: student.groupName }
                    });
                }
                fs.unlinkSync(req.file!.path);
                res.redirect('/teacher/students');
            } catch (error) {
                next(error);
            }
        });
});

router.get('/quizzes', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizzes = await prisma.quiz.findMany({
        where: { teacherId: teacher.id },
        include: { _count: { select: { questions: true, submissions: true } } }
    });
    res.render('teacher/quizzes', { title: 'Quizzes', teacher, quizzes });
});

router.get('/quizzes/create', async (req, res) => {
    const teacher = (req as any).teacher;
    res.render('teacher/create_quiz', { title: 'Create Quiz', teacher });
});

router.post('/quizzes/create', async (req, res) => {
    const teacher = (req as any).teacher;
    const { title, description, startTime, endTime, duration, totalMarks, questions } = req.body;

    await prisma.quiz.create({
        data: {
            title,
            description,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            duration: parseInt(duration),
            totalMarks: parseInt(totalMarks),
            teacherId: teacher.id,
            questions: {
                create: questions.map((q: any) => ({
                    questionText: q.text,
                    options: q.options,
                    correctOption: parseInt(q.correctOption)
                }))
            }
        }
    });
    res.redirect('/teacher/quizzes');
});

router.get('/students/:id/history', async (req, res) => {
    const teacher = (req as any).teacher;
    const studentId = req.params.id;

    const student = await prisma.student.findUnique({
        where: { id: studentId }
    });

    if (!student) return res.status(404).send('Student not found');

    const submissions = await prisma.submission.findMany({
        where: { studentId },
        include: { quiz: true },
        orderBy: { submittedAt: 'desc' }
    });

    res.render('teacher/student_history', { title: `${student.name}'s History`, teacher, student, submissions });
});

router.get('/quizzes/:id/edit', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;

    const quiz = await prisma.quiz.findUnique({
        where: { id: quizId, teacherId: teacher.id },
        include: { questions: { orderBy: { id: 'asc' } } }
    });

    if (!quiz) return res.status(404).send('Quiz not found');

    res.render('teacher/edit_quiz', { title: 'Edit Quiz', teacher, quiz });
});

router.post('/quizzes/:id/edit', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;
    const { title, description, startTime, endTime, duration, totalMarks, questions } = req.body;

    const quiz = await prisma.quiz.findUnique({
        where: { id: quizId, teacherId: teacher.id }
    });
    if (!quiz) return res.status(404).send('Quiz not found');

    try {
        await prisma.$transaction(async (tx) => {
            await tx.quiz.update({
                where: { id: quizId },
                data: {
                    title,
                    description,
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                    duration: parseInt(duration),
                    totalMarks: parseInt(totalMarks)
                }
            });

            await tx.question.deleteMany({
                where: { quizId }
            });

            if (questions && questions.length > 0) {
                await tx.question.createMany({
                    data: questions.map((q: any) => ({
                        quizId,
                        questionText: q.text,
                        options: q.options,
                        correctOption: parseInt(q.correctOption)
                    }))
                });
            }
        });
        res.redirect('/teacher/quizzes');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error updating quiz');
    }
});

router.post('/quizzes/:id/delete', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;

    const quiz = await prisma.quiz.findUnique({
        where: { id: quizId, teacherId: teacher.id }
    });
    if (!quiz) return res.status(404).send('Quiz not found');

    try {
        await prisma.$transaction([
            prisma.submission.deleteMany({ where: { quizId } }),
            prisma.question.deleteMany({ where: { quizId } }),
            prisma.quiz.delete({ where: { id: quizId } })
        ]);
        res.redirect('/teacher/quizzes');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error deleting quiz');
    }
});

router.post('/quizzes/:id/send-link', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;

    const quiz = await prisma.quiz.findUnique({
        where: { id: quizId, teacherId: teacher.id }
    });
    if (!quiz) return res.status(404).send('Quiz not found');

    const students = await prisma.student.findMany({
        where: { telegramId: { not: null } }
    });

    const baseUrl = `http://localhost:${process.env.PORT || 3000}`; // In production, use real URL
    let sentCount = 0;

    for (const student of students) {
        const text = `📝 Quiz Assigned!\n\nQuiz: ${quiz.title}\nDuration: ${quiz.duration} mins\nAvailable from: ${new Date(quiz.startTime).toLocaleString()}\nUntil: ${new Date(quiz.endTime).toLocaleString()}\n\nTake quiz here: ${baseUrl}/quiz/${student.id}/${quiz.id}`;
        try {
            const { bot } = await import('../services/telegram');
            await bot.telegram.sendMessage(student.telegramId!, text);
            sentCount++;
        } catch (error) {
            console.error(`Failed to send quiz link to student ${student.id}`, error);
        }
    }

    res.redirect(`/teacher/quizzes?linksSent=${sentCount}`);
});

router.get('/quizzes/:id/submissions', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;

    const quiz = await prisma.quiz.findUnique({
        where: { id: quizId, teacherId: teacher.id },
    });

    if (!quiz) return res.status(404).send('Quiz not found');

    const submissions = await prisma.submission.findMany({
        where: { quizId },
        include: { student: true },
        orderBy: { submittedAt: 'desc' }
    });

    res.render('teacher/submissions', { title: 'Submissions - ' + quiz.title, teacher, quiz, submissions });
});

router.post('/quizzes/:id/release-results', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;

    const quiz = await prisma.quiz.findUnique({
        where: { id: quizId, teacherId: teacher.id },
    });

    if (!quiz) return res.status(404).send('Quiz not found');

    const submissions = await prisma.submission.findMany({
        where: { quizId },
        include: { student: true }
    });

    const baseUrl = `http://localhost:${process.env.PORT || 3000}`; // In production, use real URL
    let sentCount = 0;

    for (const sub of submissions) {
        if (sub.student.telegramId && sub.submittedAt) {
            const text = `📊 Quiz Results are out!\n\nQuiz: ${quiz.title}\nScore: ${sub.score}/${quiz.totalMarks}\n\nView details: ${baseUrl}/quiz/${sub.student.id}/${quiz.id}/result`;
            try {
                const { bot } = await import('../services/telegram');
                await bot.telegram.sendMessage(sub.student.telegramId, text);
                sentCount++;
            } catch (err) {
                console.error(`Failed to send result to student ${sub.student.id}`, err);
            }
        }
    }

    res.redirect(`/teacher/quizzes/${quizId}/submissions?sent=${sentCount}`);
});

export default router;
