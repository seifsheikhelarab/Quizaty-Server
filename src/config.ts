import { z } from 'zod';

const envSchema = z.object({
    JWT_SECRET: z.string().min(32),
    DATABASE_URL: z.url(),
    CLIENT_URL: z.url(),
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    PORT: z.coerce.number().default(7492),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const config = {
    jwtSecret: parsed.data.JWT_SECRET,
    databaseUrl: parsed.data.DATABASE_URL,
    clientUrl: parsed.data.CLIENT_URL,
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    cloudinary: parsed.data.CLOUDINARY_CLOUD_NAME ? {
        cloudName: parsed.data.CLOUDINARY_CLOUD_NAME,
        apiKey: parsed.data.CLOUDINARY_API_KEY,
        apiSecret: parsed.data.CLOUDINARY_API_SECRET,
    } : undefined,
    geminiApiKey: parsed.data.GEMINI_API_KEY,
};
