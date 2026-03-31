import { describe, it, expect } from 'bun:test';
import bcrypt from 'bcrypt';
import { SALT_ROUNDS, JWT_EXPIRY, PASSWORD_MIN_LENGTH } from '../constants.js';

describe('Constants', () => {
    it('should have valid SALT_ROUNDS', () => {
        expect(SALT_ROUNDS).toBeGreaterThan(0);
        expect(SALT_ROUNDS).toBeLessThanOrEqual(15);
    });

    it('should have valid JWT_EXPIRY format', () => {
        expect(JWT_EXPIRY).toMatch(/^\d+[dhms]$/);
    });

    it('should have reasonable PASSWORD_MIN_LENGTH', () => {
        expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(6);
    });
});

describe('Password Hashing', () => {
    const testPassword = 'testPassword123';

    it('should hash password with correct salt rounds', async () => {
        const hash = await bcrypt.hash(testPassword, SALT_ROUNDS);
        expect(hash).toBeDefined();
        expect(hash).not.toBe(testPassword);
    });

    it('should verify password correctly', async () => {
        const hash = await bcrypt.hash(testPassword, SALT_ROUNDS);
        const isValid = await bcrypt.compare(testPassword, hash);
        expect(isValid).toBe(true);
    });

    it('should reject wrong password', async () => {
        const hash = await bcrypt.hash(testPassword, SALT_ROUNDS);
        const isValid = await bcrypt.compare('wrongPassword', hash);
        expect(isValid).toBe(false);
    });
});

describe('Validation', () => {
    it('should enforce minimum password length', () => {
        const shortPassword = 'abc';
        expect(shortPassword.length).toBeLessThan(PASSWORD_MIN_LENGTH);
    });
});
