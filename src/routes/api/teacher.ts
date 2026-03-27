import { Router } from 'express';
import multer from 'multer';
import prisma from '../../prisma.js';
import { authenticateTeacherAPI } from '../../middleware/apiAuth.js';
import { getActiveSubscriptionForTeacher, getPlanLimits, checkStudentLimit, checkQuizLimit, getPlanInfo, type SubscriptionTier } from '../../services/subscription.js';
import { extractQuestionsFromImage, extractQuestionsFromUrl, saveQuestionsToBank, type ExtractedQuestion } from '../../utils/ocr.js';
import { uploadToCloudinary } from '../../services/cloudinary.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticateTeacherAPI);

// GET /api/teacher/dashboard
router.get('/dashboard', async (req, res) => {
    const teacher = (req as any).teacher;

    try {
        const [quizzesCount, studentsCount, submissionsCount, classesCount, activeSubscription] = await Promise.all([
            prisma.quiz.count({ where: { teacherId: teacher.id } }),
            prisma.student.count({ where: { class: { teacherId: teacher.id } } }),
            prisma.submission.count({ where: { quiz: { teacherId: teacher.id } } }),
            prisma.class.count({ where: { teacherId: teacher.id } }),
            getActiveSubscriptionForTeacher(teacher.id)
        ]);

        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);
        const planInfo = getPlanInfo(tier);

        res.json({
            stats: {
                quizzes: quizzesCount,
                students: studentsCount,
                submissions: submissionsCount,
                classes: classesCount
            },
            subscription: activeSubscription,
            limits,
            planInfo,
            usage: {
                students: { current: studentsCount, max: limits.maxTotalStudents },
                quizzes: { current: quizzesCount, max: limits.maxQuizzes },
            }
        });
    } catch (error) {
        console.error("Dashboard API error:", error);
        res.status(500).json({ error: "Error loading dashboard" });
    }
});

// GET /api/teacher/classes
router.get('/classes', async (req, res) => {
    const teacher = (req as any).teacher;
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        const classes = await prisma.class.findMany({
            where: { teacherId: teacher.id },
            include: { _count: { select: { students: true } } },
            orderBy: { name: 'asc' }
        });
        res.json({ classes, limits });
    } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).json({ error: "Error loading classes" });
    }
});

// GET /api/teacher/classes/:id
router.get('/classes/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const classId = req.params.id;
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        const classData = await prisma.class.findUnique({
            where: { id: classId, teacherId: teacher.id },
            include: {
                students: { orderBy: { name: 'asc' } },
                quizzes: { orderBy: { startTime: 'desc' } }
            }
        });
        if (!classData) return res.status(404).json({ error: 'Class not found' });
        res.json({ classData, limits });
    } catch (error) {
        console.error("Error fetching class details:", error);
        res.status(500).json({ error: "Error loading class details" });
    }
});

// GET /api/teacher/quizzes
router.get('/quizzes', async (req, res) => {
    const teacher = (req as any).teacher;
    try {
        const quizzes = await prisma.quiz.findMany({
            where: { teacherId: teacher.id },
            include: { _count: { select: { questions: true, submissions: true } } },
            orderBy: { startTime: 'desc' }
        });
        res.json({ quizzes });
    } catch (error) {
        console.error("Error fetching quizzes:", error);
        res.status(500).json({ error: "Error loading quizzes" });
    }
});

// GET /api/teacher/quizzes/:id
router.get('/quizzes/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: {
                questions: { orderBy: { id: 'asc' } },
                classes: { include: { _count: { select: { students: true } } } },
                submissions: { include: { student: true }, orderBy: { score: 'desc' } }
            }
        });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const completedSubmissions = quiz.submissions.filter(s => s.submittedAt);
        const totalStudentsInAssignedClasses = quiz.classes.reduce((sum, c) => sum + (c as any)._count.students, 0);

        let bestScore: number | null = null;
        let worstScore: number | null = null;
        let totalScorePercentage = 0;
        let bestTime: number | null = null;
        let worstTime: number | null = null;
        let totalTime = 0;
        let validSubmissionsCount = 0;

        completedSubmissions.forEach(sub => {
            if (sub.submittedAt && quiz.totalMarks > 0) {
                const percentage = (sub.score / quiz.totalMarks) * 100;
                if (bestScore === null || percentage > bestScore) bestScore = percentage;
                if (worstScore === null || percentage < worstScore) worstScore = percentage;
                totalScorePercentage += percentage;
                const timeTakenMins = (sub.submittedAt.getTime() - sub.startedAt.getTime()) / 60000;
                if (bestTime === null || timeTakenMins < bestTime) bestTime = timeTakenMins;
                if (worstTime === null || timeTakenMins > worstTime) worstTime = timeTakenMins;
                totalTime += timeTakenMins;
                validSubmissionsCount++;
            }
        });

        const analysis = {
            bestScore: bestScore !== null ? (bestScore as number).toFixed(1) + '%' : 'N/A',
            worstScore: worstScore !== null ? (worstScore as number).toFixed(1) + '%' : 'N/A',
            avgScore: validSubmissionsCount > 0 ? (totalScorePercentage / validSubmissionsCount).toFixed(1) + '%' : 'N/A',
            bestTime: bestTime !== null ? (bestTime as number).toFixed(1) + 'm' : 'N/A',
            worstTime: worstTime !== null ? (worstTime as number).toFixed(1) + 'm' : 'N/A',
            avgTime: validSubmissionsCount > 0 ? (totalTime / validSubmissionsCount).toFixed(1) + 'm' : 'N/A',
            participation: `${completedSubmissions.length} / ${totalStudentsInAssignedClasses}`
        };

        const leaderboard = [...completedSubmissions].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const timeA = a.submittedAt!.getTime() - a.startedAt.getTime();
            const timeB = b.submittedAt!.getTime() - b.startedAt.getTime();
            return timeA - timeB;
        }).slice(0, 3);

        res.json({ quiz, analysis, leaderboard, submissions: completedSubmissions, limits });
    } catch (error) {
        console.error("Error fetching quiz details:", error);
        res.status(500).json({ error: "Error loading quiz details" });
    }
});

// GET /api/teacher/quizzes/:id/export
router.get('/quizzes/:id/export', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        if (limits.reports === 'basic') {
            return res.status(403).json({ error: 'Your current plan does not support Excel/CSV exports. Please upgrade.' });
        }

        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: {
                submissions: {
                    where: { submittedAt: { not: null } },
                    include: { student: { include: { class: true } } },
                    orderBy: { score: 'desc' }
                }
            }
        });

        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const csvRows = [];
        // Header
        csvRows.push(['Student Name', 'Class', 'Phone', 'Score', 'Percentage', 'Total', 'Time Taken (Mins)', 'Submitted At'].join(','));

        const escapeCSV = (val: any) => {
            if (val === null || val === undefined) return '""';
            let str = String(val).replace(/"/g, '""'); // Escape double quotes
            return `"${str}"`;
        };

        for (const sub of quiz.submissions) {
            const timeTaken = sub.submittedAt ? ((new Date(sub.submittedAt).getTime() - new Date(sub.startedAt).getTime()) / 60000).toFixed(1) : '-';
            const dateStr = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('en-US') : '-';
            const percentage = quiz.totalMarks > 0 ? ((sub.score / quiz.totalMarks) * 100).toFixed(1) + '%' : '0%';
            
            const row = [
                escapeCSV(sub.student.name),
                escapeCSV(sub.student.class?.name || 'No Class'),
                escapeCSV(sub.student.phone),
                sub.score,
                escapeCSV(percentage),
                quiz.totalMarks,
                timeTaken,
                escapeCSV(dateStr)
            ];
            csvRows.push(row.join(','));
        }

        const csvContent = '\uFEFF' + csvRows.join('\n'); // Add BOM for Excel UTF-8 support
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="quiz_${quizId}_results.csv"`);
        res.send(csvContent);
    } catch (error) {
        console.error("Error exporting quiz:", error);
        res.status(500).json({ error: "Error exporting quiz" });
    }
});

// POST /api/teacher/classes - Create a class
router.post('/classes', async (req, res) => {
    const teacher = (req as any).teacher;
    const { name, description, studentPhones } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Class name is required' });
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;

        const classData = await prisma.class.create({
            data: { name: name.trim(), description: description?.trim() || null, teacherId: teacher.id }
        });
        // Add students by phone numbers if provided
        if (studentPhones && typeof studentPhones === 'string') {
            const phones = studentPhones.split('\n').map((p: string) => p.trim()).filter(Boolean);
            for (const phone of phones) {
                // Check student limit before each add
                const studentCheck = await checkStudentLimit(teacher.id, tier);
                if (!studentCheck.allowed) break;

                let student = await prisma.student.findUnique({ where: { phone } });
                if (student) {
                    await prisma.student.update({ where: { id: student.id }, data: { classId: classData.id } });
                } else {
                    await prisma.student.create({ data: { name: 'Student', phone, classId: classData.id } });
                }
            }
        }
        res.json({ classData });
    } catch (error) {
        console.error("Error creating class:", error);
        res.status(500).json({ error: "Error creating class" });
    }
});

// PUT /api/teacher/classes/:id - Update a class
router.put('/classes/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const classId = req.params.id;
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
});

// POST /api/teacher/quizzes - Create a quiz
router.post('/quizzes', async (req, res) => {
    const teacher = (req as any).teacher;
    const { title, description, startTime, endTime, duration, totalMarks, questions, classIds } = req.body;
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;

        // Check quiz limit
        const quizCheck = await checkQuizLimit(teacher.id, tier);
        if (!quizCheck.allowed) {
            return res.status(403).json({
                error: `لقد وصلت إلى الحد الأقصى لعدد الاختبارات (${quizCheck.max}). يرجى ترقية باقتك.`,
                code: 'QUIZ_LIMIT_REACHED'
            });
        }

        let selectedClasses: { id: string }[] = [];
        if (classIds && Array.isArray(classIds)) {
            selectedClasses = classIds.map((id: string) => ({ id }));
        }

        const quiz = await prisma.quiz.create({
            data: {
                title,
                description,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                duration: parseInt(duration),
                totalMarks: parseInt(totalMarks),
                teacherId: teacher.id,
                classes: { connect: selectedClasses },
                questions: {
                    create: (questions || []).map((q: any) => ({
                        questionText: q.text,
                        options: Array.isArray(q.options) ? q.options : [],
                        correctOption: parseInt(q.correctOption),
                        imageUrl: q.imageUrl || null
                    }))
                }
            }
        });
        res.json({ quiz });
    } catch (error) {
        console.error("Error creating quiz:", error);
        res.status(500).json({ error: "Error creating quiz" });
    }
});

// PUT /api/teacher/quizzes/:id - Update a quiz
router.put('/quizzes/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;
    const { title, description, startTime, endTime, duration, totalMarks, questions, classIds } = req.body;
    try {
        const quiz = await prisma.quiz.findUnique({ where: { id: quizId, teacherId: teacher.id } });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        let selectedClasses: { id: string }[] = [];
        if (classIds && Array.isArray(classIds)) {
            selectedClasses = classIds.map((id: string) => ({ id }));
        }

        await prisma.$transaction(async (tx) => {
            await tx.quiz.update({
                where: { id: quizId },
                data: {
                    title, description,
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                    duration: parseInt(duration),
                    totalMarks: parseInt(totalMarks),
                    classes: { set: selectedClasses }
                }
            });
            if (questions) {
                await tx.question.deleteMany({ where: { quizId } });
                await tx.question.createMany({
                    data: questions.map((q: any) => ({
                        quizId,
                        questionText: q.text,
                        options: Array.isArray(q.options) ? q.options : [],
                        correctOption: parseInt(q.correctOption),
                        imageUrl: q.imageUrl || null
                    }))
                });
            }
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Error updating quiz:", error);
        res.status(500).json({ error: "Error updating quiz" });
    }
});

// GET /api/teacher/quizzes/:id/edit - Get quiz data for editing
router.get('/quizzes/:id/edit', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        const quiz = await prisma.quiz.findFirst({
            where: { id: req.params.id, teacherId: teacher.id },
            include: {
                questions: { orderBy: { id: 'asc' } },
                classes: { select: { id: true, name: true } }
            }
        });

        if (!quiz) return res.status(404).json({ error: "Quiz not found" });

        const classes = await prisma.class.findMany({
            where: { teacherId: teacher.id },
            orderBy: { name: 'asc' }
        });

        res.json({ quiz, classes, limits });
    } catch (error) {
        console.error("Error loading quiz edit data:", error);
        res.status(500).json({ error: "Error loading form" });
    }
});

// DELETE /api/teacher/classes/:id
router.delete('/classes/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const classId = req.params.id;
    try {
        await prisma.$transaction([
            prisma.student.updateMany({ where: { classId }, data: { classId: null } }),
            prisma.class.delete({ where: { id: classId, teacherId: teacher.id } })
        ]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting class:", error);
        res.status(500).json({ error: "Error deleting class" });
    }
});

// POST /api/teacher/classes/:id/students
router.post('/classes/:id/students', async (req, res) => {
    const teacher = (req as any).teacher;
    const classId = req.params.id;
    const { name, phone } = req.body;
    try {
        const classData = await prisma.class.findUnique({ where: { id: classId, teacherId: teacher.id } });
        if (!classData) return res.status(404).json({ error: 'Class not found' });
        if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;

        // Check student limit
        const studentCheck = await checkStudentLimit(teacher.id, tier);
        if (!studentCheck.allowed) {
            return res.status(403).json({
                error: `لقد وصلت إلى الحد الأقصى لعدد الطلاب (${studentCheck.max}). يرجى ترقية باقتك.`,
                code: 'STUDENT_LIMIT_REACHED'
            });
        }

        // Check if student already exists
        let student = await prisma.student.findUnique({ where: { phone } });
        if (student) {
            student = await prisma.student.update({ where: { id: student.id }, data: { classId } });
        } else {
            student = await prisma.student.create({ data: { name, phone, classId } });
        }
        res.json({ student });
    } catch (error) {
        console.error("Error adding student:", error);
        res.status(500).json({ error: "Error adding student" });
    }
});

// DELETE /api/teacher/classes/:id/students/:studentId
router.delete('/classes/:id/students/:studentId', async (req, res) => {
    const teacher = (req as any).teacher;
    const { id: classId, studentId } = req.params;
    try {
        const classData = await prisma.class.findUnique({ where: { id: classId, teacherId: teacher.id } });
        if (!classData) return res.status(404).json({ error: 'Class not found' });
        await prisma.student.update({ where: { id: studentId, classId }, data: { classId: null } });
        res.json({ success: true });
    } catch (error) {
        console.error("Error removing student:", error);
        res.status(500).json({ error: "Error removing student" });
    }
});

// DELETE /api/teacher/quizzes/:id
router.delete('/quizzes/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;
    try {
        const quiz = await prisma.quiz.findUnique({ where: { id: quizId, teacherId: teacher.id } });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        await prisma.$transaction([
            prisma.submission.deleteMany({ where: { quizId } }),
            prisma.question.deleteMany({ where: { quizId } }),
            prisma.quiz.delete({ where: { id: quizId } })
        ]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting quiz:", error);
        res.status(500).json({ error: "Error deleting quiz" });
    }
});

// POST /api/teacher/quizzes/:id/release-results
router.post('/quizzes/:id/release-results', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;
    try {
        const quiz = await prisma.quiz.findUnique({ where: { id: quizId, teacherId: teacher.id } });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        await prisma.quiz.update({ where: { id: quizId }, data: { showResults: true } });
        res.json({ success: true });
    } catch (error) {
        console.error("Error releasing results:", error);
        res.status(500).json({ error: "Error releasing results" });
    }
});

// GET /api/teacher/students/:id
router.get('/students/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const studentId = req.params.id;
    try {
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: {
                class: true,
                submissions: {
                    where: { quiz: { teacherId: teacher.id } },
                    include: { quiz: true },
                    orderBy: { submittedAt: 'desc' }
                }
            }
        });
        if (!student) return res.status(404).json({ error: 'Student not found' });

        let bestScore: number | null = null;
        let worstScore: number | null = null;
        let totalScorePercentage = 0;
        let validSubmissionsCount = 0;

        student.submissions.forEach(sub => {
            if (sub.submittedAt && sub.quiz.totalMarks > 0) {
                const percentage = (sub.score / sub.quiz.totalMarks) * 100;
                if (bestScore === null || percentage > bestScore) bestScore = percentage;
                if (worstScore === null || percentage < worstScore) worstScore = percentage;
                totalScorePercentage += percentage;
                validSubmissionsCount++;
            }
        });

        const analysis = {
            bestScore: bestScore !== null ? (bestScore as number).toFixed(1) + '%' : 'N/A',
            worstScore: worstScore !== null ? (worstScore as number).toFixed(1) + '%' : 'N/A',
            avgScore: validSubmissionsCount > 0 ? (totalScorePercentage / validSubmissionsCount).toFixed(1) + '%' : 'N/A'
        };

        res.json({ student, analysis });
    } catch (error) {
        console.error("Error fetching student details:", error);
        res.status(500).json({ error: "Error loading student details" });
    }
});

// GET /api/teacher/quizzes/:quizId/submissions/:submissionId
router.get('/quizzes/:quizId/submissions/:submissionId', async (req, res) => {
    const teacher = (req as any).teacher;
    const { quizId, submissionId } = req.params;
    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: { questions: { orderBy: { id: 'asc' } } }
        });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const submission = await prisma.submission.findUnique({
            where: { id: submissionId, quizId },
            include: { student: true }
        });
        if (!submission) return res.status(404).json({ error: 'Submission not found' });

        res.json({ quiz, submission });
    } catch (error) {
        console.error("Error fetching submission details:", error);
        res.status(500).json({ error: "Error loading submission details" });
    }
});

// ==========================================
// OCR Routes
// ==========================================

router.post('/ocr/extract', upload.single('image'), async (req, res) => {
    const teacher = (req as any).teacher;
    const file = req.file as Express.Multer.File;

    if (!file) {
        return res.status(400).json({ error: 'No image file provided' });
    }

    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        if (!limits.questionBank) {
            return res.status(403).json({ error: 'Your current plan does not support OCR extraction. Please upgrade.' });
        }

        const result = await extractQuestionsFromImage(file.buffer);

        res.json({
            success: true,
            questions: result.questions,
            count: result.questions.length,
            errors: result.errors
        });
    } catch (error: any) {
        console.error("OCR extraction error:", error);
        res.status(500).json({ error: "Failed to extract questions from image" });
    }
});

router.post('/ocr/extract-url', async (req, res) => {
    const teacher = (req as any).teacher;
    const { imageUrl } = req.body;

    if (!imageUrl) {
        return res.status(400).json({ error: 'Image URL is required' });
    }

    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        if (!limits.questionBank) {
            return res.status(403).json({ error: 'Your current plan does not support OCR extraction. Please upgrade.' });
        }

        const result = await extractQuestionsFromUrl(imageUrl);

        res.json({
            success: true,
            questions: result.questions,
            count: result.questions.length,
            errors: result.errors
        });
    } catch (error: any) {
        console.error("OCR extraction error:", error);
        res.status(500).json({ error: "Failed to extract questions from image URL" });
    }
});

router.post('/ocr/save', async (req, res) => {
    const teacher = (req as any).teacher;
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Questions array is required' });
    }

    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        if (!limits.questionBank) {
            return res.status(403).json({ error: 'Your current plan does not support the Question Bank. Please upgrade.' });
        }

        const validQuestions: ExtractedQuestion[] = questions.map((q: any, index: number) => {
            if (!q.questionText || !Array.isArray(q.options) || q.options.length < 4) {
                throw new Error(`Invalid question at index ${index}`);
            }
            return {
                questionText: String(q.questionText).trim(),
                options: q.options.slice(0, 4).map(String),
                correctOption: parseInt(q.correctOption) || 0,
                imageUrl: q.imageUrl || undefined
            };
        });

        const result = await saveQuestionsToBank(teacher.id, validQuestions);

        res.json({
            success: true,
            saved: result.saved,
            questions: result.questions
        });
    } catch (error: any) {
        console.error("OCR save error:", error);
        res.status(400).json({ error: error.message || "Failed to save questions" });
    }
});

router.post('/ocr/extract-and-save', upload.single('image'), async (req, res) => {
    const teacher = (req as any).teacher;
    const file = req.file as Express.Multer.File;

    if (!file) {
        return res.status(400).json({ error: 'No image file provided' });
    }

    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        if (!limits.questionBank) {
            return res.status(403).json({ error: 'Your current plan does not support OCR extraction. Please upgrade.' });
        }

        let imageUrl: string | undefined;
        try {
            imageUrl = await uploadToCloudinary(file.buffer);
        } catch (e) {
            console.error("Image upload failed, continuing without URL:", e);
        }

        const result = await extractQuestionsFromImage(file.buffer);

        if (result.questions.length === 0) {
            return res.json({
                success: false,
                message: 'No questions found in image',
                errors: result.errors
            });
        }

        const questionsWithUrl = result.questions.map(q => ({
            ...q,
            imageUrl: imageUrl || undefined
        }));

        const saved = await saveQuestionsToBank(teacher.id, questionsWithUrl);

        res.json({
            success: true,
            saved: saved.saved,
            questions: saved.questions,
            errors: result.errors
        });
    } catch (error: any) {
        console.error("OCR extract and save error:", error);
        res.status(500).json({ error: "Failed to extract and save questions" });
    }
});

// ==========================================
// Question Bank Routes
// ==========================================

// GET /api/teacher/question-bank
router.get('/question-bank', async (req, res) => {
    const teacher = (req as any).teacher;
    try {
        const questions = await prisma.bankQuestion.findMany({
            where: { teacherId: teacher.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ questions });
    } catch (error) {
        console.error("Error fetching question bank:", error);
        res.status(500).json({ error: "Error loading question bank" });
    }
});

// POST /api/teacher/question-bank
// Saves a single question to the bank
router.post('/question-bank', async (req, res) => {
    const teacher = (req as any).teacher;
    const { questionText, options, correctOption, imageUrl } = req.body;
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        if (!limits.questionBank) {
            return res.status(403).json({ error: 'Your current plan does not support the Question Bank. Please upgrade.' });
        }

        const question = await prisma.bankQuestion.create({
            data: {
                questionText,
                options,
                correctOption,
                imageUrl,
                teacherId: teacher.id
            }
        });
        res.json({ success: true, question });
    } catch (error) {
        console.error("Error saving to question bank:", error);
        res.status(500).json({ error: "Error saving question" });
    }
});

// DELETE /api/teacher/question-bank/:id
router.delete('/question-bank/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const questionId = req.params.id;
    try {
        await prisma.bankQuestion.delete({
            where: { id: questionId, teacherId: teacher.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting from question bank:", error);
        res.status(500).json({ error: "Error deleting question" });
    }
});

// ==========================================
// Assistants Routes
// ==========================================

// GET /api/teacher/assistants
router.get('/assistants', async (req, res) => {
    if ((req as any).isAssistant) return res.status(403).json({ error: 'Forbidden: Assistants cannot manage other assistants' });
    const teacher = (req as any).teacher;
    try {
        const assistants = await prisma.assistant.findMany({
            where: { teacherId: teacher.id },
            select: { id: true, name: true, email: true, createdAt: true } // Exclude password
        });
        res.json({ assistants });
    } catch (error) {
        console.error("Error fetching assistants:", error);
        res.status(500).json({ error: "Error loading assistants" });
    }
});

// POST /api/teacher/assistants
router.post('/assistants', async (req, res) => {
    if ((req as any).isAssistant) return res.status(403).json({ error: 'Forbidden: Assistants cannot manage other assistants' });
    const teacher = (req as any).teacher;
    const { name, email, password } = req.body;
    try {
        const activeSubscription = await getActiveSubscriptionForTeacher(teacher.id);
        const tier = (activeSubscription ? activeSubscription.tier : 'FREE_TRIAL') as SubscriptionTier;
        const limits = getPlanLimits(tier);

        const limit = limits.assistants;
        if (limit === 0) {
            return res.status(403).json({ error: 'Your current plan does not support Assistant accounts. Please upgrade.' });
        }

        const currentCount = await prisma.assistant.count({ where: { teacherId: teacher.id } });
        if (currentCount >= limit) {
             return res.status(403).json({ error: `You have reached the maximum number of assistants (${limit}) for your plan.` });
        }

        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);

        const assistant = await prisma.assistant.create({
            data: {
                name,
                email,
                password: hashedPassword,
                teacherId: teacher.id
            },
            select: { id: true, name: true, email: true }
        });
        res.json({ success: true, assistant });
    } catch (error: any) {
        console.error("Error adding assistant:", error);
        if (error.code === 'P2002') {
             return res.status(400).json({ error: "Email already exists" });
        }
        res.status(500).json({ error: "Error adding assistant" });
    }
});

// DELETE /api/teacher/assistants/:id
router.delete('/assistants/:id', async (req, res) => {
    if ((req as any).isAssistant) return res.status(403).json({ error: 'Forbidden: Assistants cannot manage other assistants' });
    const teacher = (req as any).teacher;
    const assistantId = req.params.id;
    try {
        await prisma.assistant.delete({
            where: { id: assistantId, teacherId: teacher.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting assistant:", error);
        res.status(500).json({ error: "Error removing assistant" });
    }
});

export default router;
