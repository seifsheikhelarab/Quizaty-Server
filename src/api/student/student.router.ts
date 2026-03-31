import { Router } from 'express';
import { authenticateStudentAPI} from '../../middleware/apiAuth.js';
import * as studentController from "./student.controller.js";

const router = Router();

router.use(authenticateStudentAPI);

// GET /api/student/dashboard
router.get('/dashboard', studentController.getStudentDashboard);

// GET /api/student/classes
router.get('/classes', studentController.getClasses);

// GET /api/student/classes/:id
router.get('/classes/:id', studentController.getClassDetails);

// DELETE /api/student/classes/:id (leave class)
router.delete('/classes/:id', studentController.leaveClass);

// GET /api/student/quizzes
router.get('/quizzes', studentController.getQuizzes);

// GET /api/student/quizzes/:id
router.get('/quizzes/:id', studentController.getQuizDetails);

// GET /api/student/quizzes/:id/test (Initiate/resume quiz)
router.get('/quizzes/:id/test', studentController.TakeQuiz);

// POST /api/student/quizzes/:id/save
router.post('/quizzes/:id/save', studentController.saveQuiz);

// POST /api/student/quizzes/:id/submit
router.post('/quizzes/:id/submit', studentController.submitQuiz);

// POST /api/student/quizzes/:id/violation
router.post('/quizzes/:id/violation', studentController.logViolation);

// GET /api/student/quizzes/:id/result
router.get('/quizzes/:id/result', studentController.getQuizResults);

export default router;
