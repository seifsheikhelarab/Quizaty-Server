import { rateLimit } from 'express-rate-limit';

/**
 * Standard API Rate Limiter
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 100,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
});

/**
 * Strict Auth Rate Limiter
 * 10 attempts per 15 minutes per IP (login, register)
 */
export const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 10,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { error: 'Too many login attempts, please try again after 15 minutes.' },
});

/**
 * OCR Rate Limiter
 * 20 extractions per hour per IP
 */
export const ocrLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	limit: 20,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { error: 'You have reached the OCR limit for this hour. Please try again later.' },
});
