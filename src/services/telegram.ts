import { Telegraf } from 'telegraf';
import prisma from '../prisma.ts';

export const bot = new Telegraf(process.env.telegram_token!);

export const initTelegramBot = () => {
    bot.start(async (ctx) => {
        ctx.reply('Welcome to QuizMaster! Please send your phone number to link your account (e.g., +1234567890).');
    });

    bot.on('text', async (ctx) => {
        const text = ctx.message.text.trim();
        if (text.startsWith('+')) {
            const student = await prisma.student.updateMany({
                where: { phone: text },
                data: { telegramId: ctx.from.id.toString() }
            });
            if (student.count > 0) {
                ctx.reply('Account linked! You will receive quiz notifications here.');
            } else {
                ctx.reply('Phone number not found in our records.');
            }
        }
    });

    bot.launch().catch(err => console.error('Telegram bot failed to start', err));
};
