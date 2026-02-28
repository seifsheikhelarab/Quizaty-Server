import express from 'express';
import path from 'path';
import 'dotenv/config';
import expressLayouts from 'express-ejs-layouts';
import cookieParser from 'cookie-parser';
import prisma from "./prisma"
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import { Telegraf } from 'telegraf';
import cron from 'node-cron';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const upload = multer({ dest: 'uploads/' });

// Telegram Bot
const bot = new Telegraf(process.env.telegram_token!);
bot.start(async (ctx) => {
    ctx.reply('Welcome to QuizMaster! Please send your phone number to link your account (e.g., +1234567890).');
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('+')) {
        const student = await prisma.student.updateMany({
            where: { phone: text },
            data: { telegramId: ctx.from.id.toString() }
        });
        if (student.count > 0) {
            ctx.reply('Account linked! You will receive quiz notifications here.');
        } else {
            ctx.reply('Phone number not found in our records.');
        }
    }
});

bot.launch().catch(err => console.error('Telegram bot failed to start', err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));
app.use(expressLayouts);
app.set('layout', path.join(process.cwd(), 'views/layouts/main'));

// Auth Middleware
const authenticateTeacher = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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

// Routes
app.get('/', (req, res) => {
    res.redirect('/teacher/dashboard');
});

// Auth Routes
app.get('/auth/login', (req, res) => {
    res.render('auth/login', { title: 'Login', error: null });
});

app.get('/auth/signup', (req, res) => {
    res.render('auth/signup', { title: 'Signup', error: null });
});

app.post('/auth/signup', async (req, res) => {
    const { email, password, name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const teacher = await prisma.teacher.create({
            data: { email, password: hashedPassword, name }
        });
        const token = jwt.sign({ id: teacher.id }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/teacher/dashboard');
    } catch (error: any) {
        res.render('auth/signup', { title: 'Signup', error: 'Email already exists' });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const teacher = await prisma.teacher.findUnique({ where: { email } });
    if (!teacher || !(await bcrypt.compare(password, teacher.password))) {
        return res.render('auth/login', { title: 'Login', error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: teacher.id }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/teacher/dashboard');
});

app.get('/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/auth/login');
});

// Teacher Routes
app.get('/teacher/dashboard', authenticateTeacher, async (req, res) => {
    const teacher = (req as any).teacher;
    const quizzes = await prisma.quiz.findMany({
        where: { teacherId: teacher.id },
        include: { _count: { select: { questions: true, submissions: true } } }
    });
    const studentsCount = await prisma.student.count();
    res.render('teacher/dashboard', { title: 'Dashboard', teacher, quizzes, studentsCount });
});

app.get('/teacher/students', authenticateTeacher, async (req, res) => {
    const teacher = (req as any).teacher;
    const students = await prisma.student.findMany({
        orderBy: { createdAt: 'desc' }
    });
    res.render('teacher/students', { title: 'Students', teacher, students });
});

app.post('/teacher/students/add', authenticateTeacher, async (req, res) => {
    const { name, phone, groupName } = req.body;
    try {
        await prisma.student.create({
            data: { name, phone, groupName }
        });
        res.redirect('/teacher/students');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error adding student');
    }
});

app.post('/teacher/students/import', authenticateTeacher, upload.single('csvFile'), async (req, res) => {
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
                console.error(error);
                res.status(500).send('Error importing students');
            }
        });
});

app.get('/teacher/quizzes', authenticateTeacher, async (req, res) => {
    const teacher = (req as any).teacher;
    const quizzes = await prisma.quiz.findMany({
        where: { teacherId: teacher.id },
        include: { _count: { select: { questions: true, submissions: true } } }
    });
    res.render('teacher/quizzes', { title: 'Quizzes', teacher, quizzes });
});

app.get('/teacher/quizzes/create', authenticateTeacher, async (req, res) => {
    const teacher = (req as any).teacher;
    res.render('teacher/create_quiz', { title: 'Create Quiz', teacher });
});

app.post('/teacher/quizzes/create', authenticateTeacher, async (req, res) => {
    const teacher = (req as any).teacher;
    const { title, description, startTime, endTime, duration, totalMarks, questions } = req.body;

    try {
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
    } catch (error) {
        console.error(error);
        res.status(500).send('Error creating quiz');
    }
});

// Student Quiz Routes
app.get('/quiz/:studentId/:quizId', async (req, res) => {
    const { studentId, quizId } = req.params;
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    const quiz = await prisma.quiz.findUnique({
        where: { id: quizId },
        include: { questions: true }
    });

    if (!student || !quiz) return res.status(404).send('Not Found');

    // Check if already submitted
    const submission = await prisma.submission.findFirst({
        where: { studentId, quizId }
    });
    if (submission?.submittedAt) return res.redirect(`/quiz/${studentId}/${quizId}/result`);

    // Check time
    const now = new Date();
    if (now < quiz.startTime) return res.send('Quiz has not started yet.');
    if (now > quiz.endTime) return res.send('Quiz has ended.');

    // Start or get submission
    let currentSubmission = submission;
    if (!currentSubmission) {
        currentSubmission = await prisma.submission.create({
            data: { studentId, quizId }
        });
    }

    res.render('student/quiz', { title: quiz.title, student, quiz, submission: currentSubmission, layout: false });
});

app.post('/quiz/:studentId/:quizId/submit', async (req, res) => {
    const { studentId, quizId } = req.params;
    const { answers } = req.body;

    const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: true } });
    if (!quiz) return res.status(404).send('Quiz not found');

    let score = 0;
    quiz.questions.forEach((q, idx) => {
        if (answers[idx] == q.correctOption) score += (quiz.totalMarks / quiz.questions.length);
    });

    await prisma.submission.updateMany({
        where: { studentId, quizId },
        data: {
            submittedAt: new Date(),
            score: Math.round(score),
            answers: answers as any
        }
    });

    // Send result to Telegram
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (student?.telegramId) {
        bot.telegram.sendMessage(student.telegramId, `✅ Quiz Completed!\n\nQuiz: ${quiz.title}\nScore: ${Math.round(score)}/${quiz.totalMarks}`);
    }

    res.redirect(`/quiz/${studentId}/${quizId}/result`);
});

app.get('/quiz/:studentId/:quizId/result', async (req, res) => {
    const { studentId, quizId } = req.params;
    const submission = await prisma.submission.findFirst({
        where: { studentId, quizId },
        include: { quiz: true, student: true }
    });
    if (!submission) return res.status(404).send('Submission not found');
    res.render('student/result', { title: 'Result', submission, layout: false });
});

// Cron Job for Reminders (every minute)
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const tenMinsLater = new Date(now.getTime() + 10 * 60000);

    const upcomingQuizzes = await prisma.quiz.findMany({
        where: {
            startTime: {
                gte: now,
                lte: tenMinsLater
            }
        },
        include: { teacher: true }
    });

    const students = await prisma.student.findMany({
        where: { telegramId: { not: null } }
    });

    for (const quiz of upcomingQuizzes) {
        for (const student of students) {
            const baseUrl = `http://localhost:${PORT}`; // In production, use real URL
            const text = `🔔 Upcoming Quiz!\n\nQuiz: ${quiz.title}\nStarts in: 10 minutes\nLink: ${baseUrl}/quiz/${student.id}/${quiz.id}`;
            bot.telegram.sendMessage(student.telegramId!, text);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
