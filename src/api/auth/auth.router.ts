import { Router } from 'express';
import * as AuthController from "./auth.controller.js";
import { authLimiter, registerLimiter } from '../../middleware/rateLimit.js';

const router = Router();

router.get('/me', AuthController.GetMe);

// POST /api/auth/login
router.post('/login', authLimiter, AuthController.login);

// POST /api/auth/register
router.post('/register', registerLimiter, AuthController.register);

// POST /api/auth/logout
router.post('/logout', AuthController.logout);

export default router;