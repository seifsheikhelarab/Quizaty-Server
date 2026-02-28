import app from './app';
import { initTelegramBot } from './services/telegram';
import { initCronJobs } from './services/cron';

const PORT = process.env.PORT || 3000;

// Initialize background services
initTelegramBot();
initCronJobs();

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
