export class AppError extends Error {
    constructor(
        public statusCode: number,
        public override message: string,
        public code: string = 'INTERNAL_ERROR'
    ) {
        super(message);
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string = 'Resource') {
        super(404, `${resource} not found`, 'NOT_FOUND');
    }
}

export class BadRequestError extends AppError {
    constructor(message: string = 'Bad request') {
        super(400, message, 'BAD_REQUEST');
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized access') {
        super(401, message, 'UNAUTHORIZED');
    }
}
