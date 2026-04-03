import express from 'express';
import path from 'path';
import 'dotenv/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import router from './api/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { config } from './config.js';
import httpLogger from './utils/logger.js';

const app = express();

// Security & Middleware
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || origin === config.clientUrl || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // Required for Alpine.js
            styleSrc: ["'self'", "'unsafe-inline'"],  // Required for inline styles
            imgSrc: ["'self'", 'data:', 'https:'],    // Allow data URLs and HTTPS images
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(httpLogger);

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));
app.set('layout', path.join(process.cwd(), 'views/layouts/main'));

// Routes
app.use('/', router);

// Error Handling Middleware
app.use(errorHandler);

export default app;
