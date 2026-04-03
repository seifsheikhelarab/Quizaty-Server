import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';
import { config } from '../config.js';

const router = Router();

router.get('/login', async (req, res) => {
    res.render('admin/login', { title: 'تسجيل دخول المدير', error: null, layout: false });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const admin = await prisma.admin.findUnique({ where: { email } });
        
        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.render('admin/login', {
                title: 'تسجيل دخول المدير',
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
                layout: false
            });
        }

        const token = jwt.sign(
            { id: admin.id, role: admin.role },
            config.jwtSecret,
            { expiresIn: '24h' }
        );

        res.cookie('admin_token', token, {
            httpOnly: true,
            sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
            secure: config.nodeEnv === 'production',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Admin login error:', error);
        res.render('admin/login', {
            title: 'تسجيل دخول المدير',
            error: 'حدث خطأ أثناء تسجيل الدخول',
            layout: false
        });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.redirect('/auth/admin/login');
});

export default router;
