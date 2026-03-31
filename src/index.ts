import "dotenv/config";
import app from './app.js';
import prisma from './prisma.js';
import { config } from './config.js';

const PORT = config.port;

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

async function shutdown() {
    console.log('Shutting down gracefully...');
    server.close(async () => {
        await prisma.$disconnect();
        console.log('Database connections closed');
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
