import pino from "pino";
import pinoHttp from "pino-http";
import type { Request, Response } from "express";

const isDevelopment = process.env.NODE_ENV !== "production";

const logger = pino({
    level: isDevelopment ? "debug" : "info",
    transport: isDevelopment ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname,req,res,responseTime,response",
            singleLine: true
        }
    } : undefined
});

const httpLogger = pinoHttp({
    logger,
    autoLogging: {
        ignore: (req: Request) => req.url === "/health" || req.url === "/api/health"
    },
    customSuccessMessage: (req: Request, res: Response) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req: Request, _res: Response, err: Error | undefined) => `${req.method} ${req.url} - ${err?.message || "Error"}`,
    customProps: () => ({}),
    useLevel: "info"
});

export default httpLogger;
export { logger };