import { Router } from 'express';
import multer from 'multer';
import { authenticateTeacherAPI } from '../../middleware/apiAuth.js';

import * as dashboardController from "./dashboard.controller.js";
import * as classesController from "./classes.controller.js";
import * as quizzesController from "./quizzes.controller.js";
import * as teacherController from "./teacher.controller.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticateTeacherAPI);

// GET /api/teacher/dashboard
router.get('/dashboard', dashboardController.getDashboard);

// GET /api/teacher/classes
router.get('/classes', classesController.getClasses);

// GET /api/teacher/classes/:id
router.get('/classes/:id', classesController.getClassDetails);

// GET /api/teacher/quizzes
router.get('/quizzes', quizzesController.getQuizzes);

// GET /api/teacher/quizzes/:id
router.get('/quizzes/:id', quizzesController.getQuizDetails);

// GET /api/teacher/quizzes/:id/export
router.get('/quizzes/:id/export', quizzesController.exportQuiz);

// POST /api/teacher/classes - Create a class
router.post('/classes', classesController.createClass);

// PUT /api/teacher/classes/:id - Update a class
router.put('/classes/:id', classesController.updateClass);

// POST /api/teacher/quizzes - Create a quiz
router.post('/quizzes', quizzesController.createQuiz);

// POST /api/teacher/quizzes/new/question-image - Upload image before quiz is created
router.post('/quizzes/new/question-image', upload.single('image'), quizzesController.uploadQuestionImage);

// PUT /api/teacher/quizzes/:id - Update a quiz
router.put('/quizzes/:id', quizzesController.updateQuiz);

// GET /api/teacher/quizzes/:id/edit - Get quiz data for editing
router.get('/quizzes/:id/edit', quizzesController.getQuizUpdate);

// DELETE /api/teacher/classes/:id
router.delete('/classes/:id', classesController.deleteClass);

// POST /api/teacher/classes/:id/students
router.post('/classes/:id/students', classesController.addStudent);

// DELETE /api/teacher/classes/:id/students/:studentId
router.delete('/classes/:id/students/:studentId', classesController.removeStudent);

// DELETE /api/teacher/quizzes/:id
router.delete('/quizzes/:id', quizzesController.deleteQuiz);

// POST /api/teacher/quizzes/:id/release-results
router.post('/quizzes/:id/release-results', quizzesController.releaseQuizResults);

// POST /api/teacher/quizzes/:id/question-image - Upload image for a question
router.post('/quizzes/:id/question-image', upload.single('image'), quizzesController.uploadQuestionImage);

// GET /api/teacher/students/:id
router.get('/students/:id', teacherController.getStudentDetails);

// GET /api/teacher/quizzes/:quizId/submissions/:submissionId
router.get('/quizzes/:quizId/submissions/:submissionId', teacherController.getSubmissionDetails);

// ==========================================
// OCR Routes
// ==========================================

router.post('/ocr/extract', upload.single('image'), teacherController.extractOcrFromImage);

router.post('/ocr/extract-url', teacherController.extractOcrFromUrl);

router.post('/ocr/save', teacherController.saveOcrQuestions);

router.post('/ocr/extract-and-save', upload.single('image'), teacherController.extractAndSaveOcr);

// ==========================================
// Question Bank Routes
// ==========================================

router.get('/question-bank', teacherController.getQuestionBank);

router.post('/question-bank', teacherController.saveQuestionToBank);

router.delete('/question-bank/:id', teacherController.deleteQuestionFromBank);

// ==========================================
// Assistants Routes
// ==========================================

router.get('/assistants', teacherController.getAssistants);

router.post('/assistants', teacherController.createAssistant);

router.delete('/assistants/:id', teacherController.deleteAssistant);

export default router;
