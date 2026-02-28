import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Singleton Prisma Client.
 * Ensures only one connection to the database.
 * Uses the PrismaPg adapter for Prisma 7.
 */
let prisma: PrismaClient;

declare global {
    var prismaInstance: typeof prisma | undefined;
}

if (!global.prismaInstance) {
    const adapter = new PrismaPg({
        connectionString: process.env.DATABASE_URL
    });
    prisma = new PrismaClient({ adapter });
    global.prismaInstance = prisma;
} else {
    prisma = global.prismaInstance;
}

export default prisma;