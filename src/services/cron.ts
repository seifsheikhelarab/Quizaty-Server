import cron from 'node-cron';
import prisma from '../prisma';
import { bot } from './telegram';

export const initCronJobs = () => {
    // Cron Job for Reminders (every minute)
    cron.schedule('* * * * *', async () => {
        const now = new Date();
        const tenMinsLater = new Date(now.getTime() + 10 * 60000);

        const upcomingQuizzes = await prisma.quiz.findMany({
            where: {
                startTime: {
                    gte: now,
                    lte: tenMinsLater
                }
            },
            include: { teacher: true }
        });

        const students = await prisma.student.findMany({
            where: { telegramId: { not: null } }
        });

        for (const quiz of upcomingQuizzes) {
            for (const student of students) {
                const baseUrl = `http://localhost:${process.env.PORT || 7492}`; // In production, use real URL
                const text = `🔔 Upcoming Quiz!\n\nQuiz: ${quiz.title}\nStarts in: 10 minutes\nLink: ${baseUrl}/quiz/${student.id}/${quiz.id}`;
                bot.telegram.sendMessage(student.telegramId!, text);
            }
        }
    });
};
