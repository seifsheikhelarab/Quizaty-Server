import { Router } from 'express';
import * as ClassesController from "./classes.controller.js"

const router = Router();

// POST /api/classes/:id/join
router.post('/:id/join', ClassesController.joinClass);

export default router;
