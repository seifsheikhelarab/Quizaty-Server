import { Router } from 'express';
import prisma from '../prisma.js';
import { authenticateTeacher } from '../middleware.js';
import multer from 'multer';
import { storage } from '../utils/cloud_storage.js';

const router = Router();
const upload = multer({ storage });

router.use(authenticateTeacher);

// --- Dashboard ---
router.get('/dashboard', async (req, res) => {
    const teacher = (req as any).teacher;

    try {
        const [quizzesCount, studentsCount, submissionsCount, classesCount] = await Promise.all([
            prisma.quiz.count({ where: { teacherId: teacher.id } }),
            prisma.student.count({
                where: {
                    class: {
                        teacherId: teacher.id
                    }
                }
            }),
            prisma.submission.count({
                where: {
                    quiz: {
                        teacherId: teacher.id
                    }
                }
            }),
            prisma.class.count({ where: { teacherId: teacher.id } })
        ]);

        res.render('teacher/dashboard', {
            title: 'Teacher Dashboard',
            teacher,
            stats: {
                quizzes: quizzesCount,
                students: studentsCount,
                submissions: submissionsCount,
                classes: classesCount
            }
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).send("Error loading dashboard");
    }
});

// --- Class Management ---

router.get('/classes', async (req, res) => {
    const teacher = (req as any).teacher;
    try {
        const classes = await prisma.class.findMany({
            where: { teacherId: teacher.id },
            include: { _count: { select: { students: true } } },
            orderBy: { name: 'asc' }
        });
        res.render('teacher/classes', { title: 'Manage Classes', teacher, classes });
    } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).send("Error loading classes");
    }
});

router.get('/classes/create', async (req, res) => {
    const teacher = (req as any).teacher;
    res.render('teacher/create_class', { title: 'Create New Class', teacher });
});

router.post('/classes/create', async (req, res) => {
    const teacher = (req as any).teacher;
    const { name, description, studentPhones } = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).send("Class name is required.");
    }

    try {
        const classData = await prisma.class.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                teacherId: teacher.id
            }
        });

        if (studentPhones && typeof studentPhones === 'string') {
            const phones = studentPhones.split('\n').map((p: string) => p.trim()).filter(Boolean);
            for (const phone of phones) {
                let student = await prisma.student.findUnique({ where: { phone } });
                if (student) {
                    await prisma.student.update({
                        where: { id: student.id },
                        data: { classId: classData.id }
                    });
                } else {
                    await prisma.student.create({
                        data: { name: 'Student', phone, classId: classData.id }
                    });
                }
            }
        }
        res.redirect('/teacher/classes');
    } catch (error) {
        console.error("Error creating class:", error);
        res.status(500).send("Error creating class");
    }
});

router.get('/classes/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const classId = req.params.id;

    try {
        const classData = await prisma.class.findUnique({
            where: { id: classId, teacherId: teacher.id },
            include: {
                students: {
                    orderBy: { name: 'asc' }
                },
                quizzes: {
                    orderBy: { startTime: 'desc' }
                }
            }
        });

        if (!classData) return res.status(404).send('Class not found');

        res.render('teacher/class_detail', { title: classData.name, teacher, classData });
    } catch (error) {
        console.error("Error fetching class details:", error);
        res.status(500).send("Error loading class details");
    }
});

router.get('/classes/:id/edit', async (req, res) => {
    const teacher = (req as any).teacher;
    const classId = req.params.id;

    try {
        const classData = await prisma.class.findUnique({
            where: { id: classId, teacherId: teacher.id }
        });

        if (!classData) return res.status(404).send('Class not found');

        res.render('teacher/edit_class', { title: 'Edit Class', teacher, classData });
    } catch (error) {
        console.error("Error loading edit class form:", error);
        res.status(500).send("Error loading form");
    }
});

router.post('/classes/:id/edit', async (req, res) => {
    const teacher = (req as any).teacher;
    const classId = req.params.id;
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).send("Class name is required.");
    }

    try {
        await prisma.class.update({
            where: { id: classId, teacherId: teacher.id },
            data: {
                name: name.trim(),
                description: description?.trim() || null
            }
        });
        res.redirect(`/teacher/classes/${classId}`);
    } catch (error) {
        console.error("Error updating class:", error);
        res.status(500).send("Error updating class");
    }
});

router.post('/classes/:id/delete', async (req, res) => {
    const teacher = (req as any).teacher;
    const classId = req.params.id;

    try {
        await prisma.$transaction([
            prisma.student.updateMany({
                where: { classId: classId },
                data: { classId: null }
            }),
            prisma.class.delete({
                where: { id: classId, teacherId: teacher.id }
            })
        ]);

        res.redirect('/teacher/classes');
    } catch (error) {
        console.error("Error deleting class:", error);
        res.status(500).send("Error deleting class");
    }
});

router.post('/classes/:id/students/add', async (req, res) => {
    const teacher = (req as any).teacher;
    const classId = req.params.id;
    const { name, phone } = req.body;

    try {
        const classData = await prisma.class.findUnique({
            where: { id: classId, teacherId: teacher.id }
        });
        if (!classData) return res.status(404).send('Class not found');

        if (!name || !phone) return res.status(400).send("Name and phone are required.");

        let student = await prisma.student.findUnique({ where: { phone } });
        if (student) {
            // Associate existing to class
            await prisma.student.update({
                where: { id: student.id },
                data: { classId }
            });
        } else {
            // Pre-register new student explicitly tied to this class
            await prisma.student.create({
                data: { name, phone, classId }
            });
        }

        res.redirect(`/teacher/classes/${classId}`);
    } catch (error) {
        console.error("Error adding student to class:", error);
        res.status(500).send("Error adding student");
    }
});

router.post('/classes/:id/students/:studentId/remove', async (req, res) => {
    const teacher = (req as any).teacher;
    const { id: classId, studentId } = req.params;

    try {
        const classData = await prisma.class.findUnique({
            where: { id: classId, teacherId: teacher.id }
        });
        if (!classData) return res.status(404).send('Class not found');

        await prisma.student.update({
            where: { id: studentId, classId: classId },
            data: { classId: null }
        });

        res.redirect(`/teacher/classes/${classId}`);
    } catch (error) {
        console.error("Error removing student from class:", error);
        res.status(500).send("Error removing student");
    }
});

// --- Student Details ---

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

        if (!student) return res.status(404).send('Student not found');

        // Calculate analysis: best score, worst score, average score (per doc)
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

        res.render('teacher/student_details', { title: student.name, teacher, student, analysis });
    } catch (error) {
        console.error("Error fetching student details:", error);
        res.status(500).send("Error loading student details");
    }
});

// --- Quiz Management ---

router.get('/quizzes', async (req, res) => {
    const teacher = (req as any).teacher;
    try {
        const quizzes = await prisma.quiz.findMany({
            where: { teacherId: teacher.id },
            include: { _count: { select: { questions: true, submissions: true } } },
            orderBy: { startTime: 'desc' }
        });
        res.render('teacher/quizzes', { title: 'Manage Quizzes', teacher, quizzes });
    } catch (error) {
        console.error("Error fetching quizzes:", error);
        res.status(500).send("Error loading quizzes");
    }
});

router.get('/quizzes/create', async (req, res) => {
    const teacher = (req as any).teacher;
    try {
        const classes = await prisma.class.findMany({
            where: { teacherId: teacher.id },
            orderBy: { name: 'asc' }
        });
        res.render('teacher/create_quiz', { title: 'Create Quiz', teacher, classes });
    } catch (error) {
        console.error("Error loading create quiz form:", error);
        res.status(500).send("Error loading form");
    }
});

router.post('/quizzes/create', upload.any(), async (req, res) => {
    const teacher = (req as any).teacher;
    const { title, description, startTime, endTime, duration, totalMarks, questions, classIds } = req.body;
    const files = req.files as Express.Multer.File[];

    let selectedClasses: { id: string }[] = [];
    if (classIds) {
        if (Array.isArray(classIds)) {
            selectedClasses = (classIds as string[]).map((id: string) => ({ id }));
        } else {
            selectedClasses = [{ id: classIds as string }];
        }
    }

    const questionsArr = Array.isArray(questions) ? questions : (questions ? Object.values(questions as object) : []);

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
                classes: {
                    connect: selectedClasses
                },
                questions: {
                    create: questionsArr.map((q: any, i: number) => {
                        const file = files?.find(f => f.fieldname === `questions[${i}][image]`);
                        return {
                            questionText: q.text,
                            options: Array.isArray(q.options) ? q.options : (q.options ? Object.values(q.options) : []),
                            correctOption: parseInt(q.correctOption),
                            imageUrl: file ? file.path : null
                        };
                    })
                }
            }
        });
        res.redirect('/teacher/quizzes');
    } catch (error) {
        console.error("Error creating quiz:", error);
        res.status(500).send("Error creating quiz");
    }
});

router.get('/quizzes/:id', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id;

    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: {
                questions: { orderBy: { id: 'asc' } },
                classes: {
                    include: {
                        _count: { select: { students: true } }
                    }
                },
                submissions: {
                    include: { student: true },
                    orderBy: { score: 'desc' }
                }
            }
        });

        if (!quiz) return res.status(404).send('Quiz not found');

        let bestScore: number | null = null;
        let worstScore: number | null = null;
        let totalScorePercentage = 0;
        let bestTime: number | null = null;
        let worstTime: number | null = null;
        let totalTime = 0;
        let validSubmissionsCount = 0;

        const completedSubmissions = quiz.submissions.filter(s => s.submittedAt);
        const totalStudentsInAssignedClasses = quiz.classes.reduce((sum, c) => sum + (c as any)._count.students, 0);

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

        const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 7492}`;
        res.render('teacher/quiz_details', {
            title: quiz.title, teacher, quiz, analysis, leaderboard, submissions: completedSubmissions, baseUrl
        });
    } catch (error) {
        console.error("Error fetching quiz details:", error);
        res.status(500).send("Error loading quiz details");
    }
});

router.get('/quizzes/:id/edit', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id as string;

    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: { questions: { orderBy: { id: 'asc' } }, classes: true }
        });

        if (!quiz) return res.status(404).send('Quiz not found');

        const classes = await prisma.class.findMany({
            where: { teacherId: teacher.id },
            orderBy: { name: 'asc' }
        });

        res.render('teacher/edit_quiz', { title: 'Edit Quiz', teacher, quiz, classes });
    } catch (error) {
        console.error("Error loading edit quiz form:", error);
        res.status(500).send("Error loading form");
    }
});

router.post('/quizzes/:id/edit', upload.any(), async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id as string;
    const { title, description, startTime, endTime, duration, totalMarks, questions, classIds } = req.body;
    const files = req.files as Express.Multer.File[];

    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: { questions: { orderBy: { id: 'asc' } } }
        });
        if (!quiz) return res.status(404).send('Quiz not found');

        let selectedClasses: { id: string }[] = [];
        if (classIds) {
            if (Array.isArray(classIds)) {
                selectedClasses = (classIds as string[]).map((id: string) => ({ id }));
            } else {
                selectedClasses = [{ id: classIds as string }];
            }
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

            if (questions && questions.length > 0) {
                await tx.question.deleteMany({ where: { quizId } });
                await tx.question.createMany({
                    data: questions.map((q: any, i: number) => {
                        const file = files?.find(f => f.fieldname === `questions[${i}][image]`);
                        const oldImageUrl = quiz.questions[i]?.imageUrl;
                        return {
                            quizId,
                            questionText: q.text,
                            options: q.options,
                            correctOption: parseInt(q.correctOption),
                            imageUrl: file ? file.path : oldImageUrl
                        };
                    })
                });
            }
        });
        res.redirect(`/teacher/quizzes/${quizId}`);
    } catch (error) {
        console.error("Error updating quiz:", error);
        res.status(500).send('Error updating quiz');
    }
});

router.post('/quizzes/:id/delete', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id as string;

    try {
        const quiz = await prisma.quiz.findUnique({ where: { id: quizId, teacherId: teacher.id } });
        if (!quiz) return res.status(404).send('Quiz not found');

        await prisma.$transaction([
            prisma.submission.deleteMany({ where: { quizId } }),
            prisma.question.deleteMany({ where: { quizId } }),
            prisma.quiz.delete({ where: { id: quizId } })
        ]);
        res.redirect('/teacher/quizzes');
    } catch (error) {
        console.error("Error deleting quiz:", error);
        res.status(500).send('Error deleting quiz');
    }
});

router.post('/quizzes/:id/release-results', async (req, res) => {
    const teacher = (req as any).teacher;
    const quizId = req.params.id as string;

    try {
        const quiz = await prisma.quiz.findUnique({ where: { id: quizId, teacherId: teacher.id } });
        if (!quiz) return res.status(404).send('Quiz not found');

        res.redirect(`/teacher/quizzes/${quizId}?released=1`);
    } catch (error) {
        console.error("Error releasing results:", error);
        res.status(500).send('Error releasing results');
    }
});

router.get('/quizzes/:quizId/submissions/:submissionId', async (req, res) => {
    const teacher = (req as any).teacher;
    const { quizId, submissionId } = req.params;

    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, teacherId: teacher.id },
            include: { questions: { orderBy: { id: 'asc' } } }
        });
        if (!quiz) return res.status(404).send('Quiz not found');

        const submission = await prisma.submission.findUnique({
            where: { id: submissionId, quizId },
            include: { student: true }
        });
        if (!submission) return res.status(404).send('Submission not found');

        res.render('teacher/submission_details', { title: 'Submission Details', teacher, quiz, submission });
    } catch (error) {
        console.error("Error fetching submission details:", error);
        res.status(500).send("Error loading submission details");
    }
});

export default router;
