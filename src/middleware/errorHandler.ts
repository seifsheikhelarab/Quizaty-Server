import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            error: err.code,
            message: err.message,
        });
        return;
    }

    console.error('Unhandled Error:', err);

    res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
    });
};
