import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../../prisma.js';
import type { Request, Response } from "express";
import { config } from '../../config.js';
import { loginSchema, registerSchema, validateBody } from '../../utils/validation.js';
import { JWT_EXPIRY, SALT_ROUNDS } from '../../constants.js';

function setAuthCookie(res: Response, token: string) {
    res.cookie('token', token, {
        httpOnly: true,
        sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
        secure: config.nodeEnv === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
}

export async function GetMe(req: Request, res: Response) {
	const token = req.cookies.token;
	if (!token) return res.status(401).json({ error: 'Unauthorized' });

	try {
		const decoded = jwt.verify(token, config.jwtSecret) as { id: string, role: string, assistantId?: string };
		let user;

		if (decoded.role === 'teacher') {
			user = await prisma.teacher.findUnique({
				where: { id: decoded.id },
				select: { id: true, email: true, name: true, phone: true }
			});
			// Support for assistant logins
			if (decoded.assistantId) {
				const assistant = await prisma.assistant.findUnique({ where: { id: decoded.assistantId } });
				if (assistant && user) {
	
					user = { ...user, name: assistant.name, email: assistant.email, assistantId: assistant.id, isAssistant: true } as typeof user & { assistantId: string; isAssistant: true };
				}
			}
		} else {
			user = await prisma.student.findUnique({
				where: { id: decoded.id },
				select: { id: true, name: true, phone: true }
			});
		}

		if (!user) return res.status(401).json({ error: 'User not found' });

		res.json({ user: { ...user, role: decoded.role } });
	} catch (e) {
		res.status(401).json({ error: 'Invalid token' });
		console.error(e);
	}
}

export async function login(req: Request, res: Response) {
	const validation = validateBody(loginSchema)(req.body);
	if (!validation.success) {
		return res.status(400).json({ error: validation.error });
	}

	const { role, password, email, phone } = validation.data;

	try {
		if (role === 'teacher') {
			const teacher = await prisma.teacher.findUnique({ where: { email } });
			if (teacher && (await bcrypt.compare(password, teacher.password))) {
				const token = jwt.sign({ id: teacher.id, role: 'teacher' }, config.jwtSecret, { expiresIn: JWT_EXPIRY });
				setAuthCookie(res, token);
				return res.json({ user: { id: teacher.id, email: teacher.email, name: teacher.name, role: 'teacher' } });
			}

			// Check if it's an Assistant
			const assistant = await prisma.assistant.findUnique({ where: { email } });
			if (assistant && (await bcrypt.compare(password, assistant.password))) {
				const token = jwt.sign({ id: assistant.teacherId, assistantId: assistant.id, role: 'teacher' }, config.jwtSecret, { expiresIn: JWT_EXPIRY });
				setAuthCookie(res, token);
				return res.json({ user: { id: assistant.teacherId, assistantId: assistant.id, email: assistant.email, name: assistant.name, role: 'teacher', isAssistant: true } });
			}

			return res.status(401).json({ error: 'Invalid credentials' });

		} else if (role === 'student') {
			const phoneStr = phone!;
			const normalizedPhone = phoneStr.startsWith('+') ? phoneStr : (phoneStr.startsWith('01') ? `+20${phoneStr.substring(1)}` : phoneStr);
			let student = await prisma.student.findUnique({ where: { phone: phoneStr } });
			if (!student) {
				student = await prisma.student.findFirst({
					where: {
						OR: [
							{ phone: normalizedPhone },
							{ phone: phoneStr.replace('+', '') }
						]
					}
				});
			}

			if (!student || !student.password || !(await bcrypt.compare(password, student.password))) {
				return res.status(401).json({ error: 'Invalid phone number or password' });
			}
			const token = jwt.sign({ id: student.id, role: 'student' }, config.jwtSecret, { expiresIn: JWT_EXPIRY });
				setAuthCookie(res, token);
			return res.json({ user: { id: student.id, name: student.name, phone: student.phone, role: 'student' } });

		} else {
			return res.status(400).json({ error: 'Invalid role selected' });
		}
	} catch (error: unknown) {
		console.error("API Login error:", error);
		res.status(500).json({ error: 'Login failed' });
	}
}

export async function register(req: Request, res: Response) {
	const validation = validateBody(registerSchema)(req.body);
	if (!validation.success) {
		return res.status(400).json({ error: validation.error });
	}

	const { role, password, name, phone, email, parentPhone } = validation.data;

	try {
		const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
		let user;

		if (role === 'teacher') {
			user = await prisma.$transaction(async (tx) => {
				const newTeacher = await tx.teacher.create({
					data: { email: email!, password: hashedPassword, name: name || '', phone: phone || '' }
				});
				const now = new Date();
				const expiresAt = new Date(now.getTime());
				expiresAt.setDate(expiresAt.getDate() + 7);
				await tx.subscription.create({
					data: {
						teacherId: newTeacher.id,
						tier: 'FREE_TRIAL',
						status: 'active',
						startedAt: now,
						expiresAt
					}
				});
				return newTeacher;
			});
			const token = jwt.sign({ id: user.id, role: 'teacher' }, config.jwtSecret, { expiresIn: JWT_EXPIRY });
			setAuthCookie(res, token);
			return res.json({ user: { id: user.id, email: user.email, name: user.name, role: 'teacher' } });

		} else if (role === 'student') {
			const phoneStr = phone!;
			user = await prisma.student.findUnique({ where: { phone: phoneStr } });

			if (user) {
				if (user.password) {
					return res.status(400).json({ error: 'An account with this phone number already exists.' });
				}
				user = await prisma.student.update({
					where: { id: user.id },
					data: { password: hashedPassword, name: name || user.name, parentPhone }
				});
			} else {
				user = await prisma.student.create({
					data: { name: name || '', phone: phoneStr, password: hashedPassword, parentPhone }
				});
			}

			const token = jwt.sign({ id: user.id, role: 'student' }, config.jwtSecret, { expiresIn: JWT_EXPIRY });
			setAuthCookie(res, token);
			return res.json({ user: { id: user.id, name: user.name, phone: user.phone, role: 'student' } });
		} else {
			return res.status(400).json({ error: 'Invalid role selected' });
		}

	} catch (error: unknown) {
		console.error("API Registration error:", error);
		res.status(500).json({ error: 'Registration failed' });
	}
}

export function logout(req: Request, res: Response) {
	res.clearCookie('token');
	res.json({ success: true });
}