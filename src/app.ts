import express from 'express';
import path from 'path';
import 'dotenv/config';
import expressLayouts from 'express-ejs-layouts';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import router from './routes/index.ts';
import { errorHandler } from './middleware/errorHandler.ts';

const app = express();

// Security & Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Disabled CSP for inline scripts (Alpine.js)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), 'public')));

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));
app.use(expressLayouts);
app.set('layout', path.join(process.cwd(), 'views/layouts/main'));

// Routes
app.use('/', router);

// Error Handling Middleware
app.use(errorHandler);

export default app;
