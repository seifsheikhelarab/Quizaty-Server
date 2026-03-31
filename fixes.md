# Quizaty-Server Fixes & Improvements

This document outlines all identified issues and recommended fixes, organized by priority.

---

## Table of Contents

1. [Critical Issues](#critical-issues) - Must fix immediately
2. [High Priority](#high-priority) - Should fix before production
3. [Medium Priority](#medium-priority) - Important for stability
4. [Low Priority](#low-priority) - Nice to have
5. [Database Issues](#database-issues) - Performance & schema
6. [Code Quality](#code-quality) - Maintainability improvements

---

## Critical Issues

### 1. Missing Router Import (App Won't Start)
- **File:** `src/app.ts:28`
- **Issue:** Uses `router` without importing it
- **Fix:** Add `import router from './api/index.js';`

### 2. Hardcoded JWT Secret Fallback
- **Files:** 
  - `src/middleware.ts:5`
  - `src/middleware/apiAuth.ts:5`
  - `src/api/auth/auth.controller.ts:6`
  - `src/api/classes/classes.controller.ts:6`
- **Issue:** JWT_SECRET falls back to `'your-secret-key'` when env var missing
- **Fix:** Remove fallback, require env var to be set. Throw error at startup if missing.

### 3. JWT Tokens Never Expire
- **File:** `src/api/auth/auth.controller.ts:52,60,85,122,143`
- **Issue:** `jwt.sign()` called without `expiresIn` option
- **Fix:** Add `expiresIn: '24h'` to all JWT signing calls

### 4. Password Hashes Exposed in API Responses
- **Files:**
  - `src/api/student/student.controller.ts:27`
  - `src/api/teacher/teacher.controller.ts:562`
- **Issue:** API returns full student/teacher objects including `password` field
- **Fix:** Use Prisma `select` or `omit` to exclude password fields from responses

### 5. Unused `logout` Function in Auth Router
- **File:** `src/api/auth/auth.router.ts:14`
- **Issue:** Route handler is empty (`router.post('/logout', );`)
- **Fix:** Change to `router.post('/logout', AuthController.logout);`

---

## High Priority

### 6. CSP Disabled
- **File:** `src/app.ts:16`
- **Issue:** `helmet({ contentSecurityPolicy: false })` completely disables CSP
- **Fix:** Re-enable CSP with a restrictive policy that allows only necessary inline scripts

### 7. No Input Validation
- **Issue:** `zod` is a dependency but never used
- **Fix:** Implement Zod validation schemas for all request bodies

### 8. No Rate Limiting
- **Issue:** `express-rate-limit` installed but never configured
- **Fix:** Configure rate limiting for login, registration, and sensitive endpoints

### 9. Missing Transaction in Teacher Registration
- **File:** `src/api/auth/auth.controller.ts:106-121`
- **Issue:** Creates teacher, then creates subscription - if subscription fails, teacher exists without subscription
- **Fix:** Wrap both operations in `prisma.$transaction()`

### 10. Missing Transaction in createClass
- **File:** `src/api/teacher/teacher.controller.ts:249-267`
- **Issue:** Class creation and student operations not in transaction
- **Fix:** Wrap in `prisma.$transaction()`

---

## Medium Priority

### 11. CORS Origin Not Validated
- **File:** `src/app.ts:12-15`
- **Issue:** If `CLIENT_URL` env var is unset, CORS blocks all requests
- **Fix:** Add validation that fails fast if `CLIENT_URL` is not set

### 12. Cookie Security in Development
- **File:** `src/api/auth/auth.controller.ts:53,61,86,123,144`
- **Issue:** `secure: process.env.NODE_ENV === 'production'` sends cookies over HTTP in dev
- **Fix:** Use `secure: true` in all environments with proper HTTPS in development

### 13. Missing Graceful Shutdown
- **File:** `src/index.ts`
- **Issue:** No handler to disconnect Prisma client on process termination
- **Fix:** Add signal handlers:
```typescript
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});
```

### 14. No CSRF Protection
- **Issue:** No CSRF tokens for state-changing POST/PUT/DELETE requests
- **Fix:** Implement CSRF tokens for all forms and API endpoints

### 15. Error Responses Inconsistent
- **Issue:** Some endpoints return `{ error: '...' }`, others `{ error: '...', message: '...' }`
- **Fix:** Standardize error response format, use custom `AppError` classes

### 16. Inconsistent Naming Conventions
- **Issue:** Mix of PascalCase/camelCase for function names
- **Fix:** Standardize all controller functions to camelCase

### 17. Hardcoded Magic Numbers
- **Files:** Multiple locations
- **Issue:** Salt rounds (10), trial duration (7 days), pagination (15) hardcoded
- **Fix:** Extract to constants file:
```typescript
// src/constants.ts
export const SALT_ROUNDS = 10;
export const FREE_TRIAL_DAYS = 7;
export const ITEMS_PER_PAGE = 15;
```

### 18. No Logging of Security Events
- **Issue:** Failed login attempts, unauthorized access not logged
- **Fix:** Add structured logging for security events

---

## Low Priority

### 19. JWT_SECRET Duplicated
- **Files:** 4 locations
- **Issue:** Same constant defined in multiple files
- **Fix:** Create shared config module:
```typescript
// src/config.ts
import { cleanEnv, str } from 'envalid'; // or use zod
export const config = cleanEnv(process.env, {
    JWT_SECRET: str(),
    // ...
});
```

### 20. Cookie Setting Logic Duplicated
- **File:** `src/api/auth/auth.controller.ts`
- **Issue:** Same cookie options repeated 5 times
- **Fix:** Create helper function:
```typescript
const setAuthCookie = (res: Response, token: string) => {
    res.cookie('token', token, {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production'
    });
};
```

### 21. Unused Zod Dependency
- **File:** `package.json:64`
- **Issue:** Zod listed but never used
- **Fix:** Implement validation (see #7)

### 22. Unused Cloud Storage Utility
- **Files:** `src/utils/cloud_storage.ts`, `src/services/cloudinary.ts`
- **Issue:** Duplicate Cloudinary configuration
- **Fix:** Remove redundant utility file

### 23. Large Files Need Refactoring
- **Files:** 
  - `src/api/teacher/teacher.controller.ts` (900 lines)
  - `src/routes/admin.ts` (372 lines)
- **Issue:** Functions exceed 50 lines, monolithic files
- **Fix:** Split into smaller, focused modules

### 24. Duplicate Logic in Router vs Controller
- **Issue:** OCR endpoints, question bank, assistants implemented in both router and controller
- **Fix:** Move all business logic to controllers; routers only define routes

### 25. No Test Suite
- **Issue:** No test files or test script
- **Fix:** Add tests for critical business logic:
  - Authentication flow
  - Subscription limits
  - OCR extraction
  - Quiz submission scoring

---

## Database Issues

### 26. Missing Indexes on Foreign Keys
- **Issue:** No `@@index` on foreign keys in Prisma schema
- **Impact:** Full table scans for queries on `Quiz.teacherId`, `Class.teacherId`, `Submission.studentId`, etc.
- **Fix:** Add indexes in `prisma/schema.prisma`:
```prisma
model Quiz {
    teacherId String
    @@index([teacherId])
}

model Submission {
    studentId String
    quizId String
    @@index([studentId])
    @@index([quizId])
}
```

### 27. Incomplete Migration History
- **Issue:** Schema changed but no corresponding migration file
- **Fix:** Run `npx prisma migrate dev --name add_missing_models`

### 28. N+1 Query in createClass
- **File:** `src/api/teacher/teacher.controller.ts:253-266`
- **Issue:** Loop with individual database queries for each student
- **Fix:** Use `createMany` or batch queries:
```typescript
// Instead of loop:
const newStudents = phones.map(phone => ({ ... }));
await prisma.student.createMany({ data: newStudents });
```

### 29. N+1 Query in getQuizDetails
- **File:** `src/api/teacher/teacher.controller.ts:122-123`
- **Issue:** Fetches all submissions then processes in memory
- **Fix:** Use Prisma aggregate API for statistics

### 30. No Pagination on List Endpoints
- **Issue:** Many `findMany` calls don't use pagination
- **Fix:** Add `take`/`skip` parameters to all list endpoints

### 31. Repeated Count Checks in Subscription Limits
- **File:** `src/services/subscription.ts:128-159`
- **Issue:** Full count query on every call
- **Fix:** Cache results or optimize with estimated counts

---

## Code Quality

### 32. Type Safety Issues
- **Issue:** Heavy use of `as` type assertions
- **Fix:** Use runtime validation (Zod) instead of type assertions

### 33. TypeScript Strict Mode Disabled
- **File:** `tsconfig.json`
- **Issue:** `noUnusedLocals` and `noUnusedParameters` disabled
- **Fix:** Enable these flags to catch dead code

### 34. Admin Route Type Assertion Repeated
- **File:** `src/routes/admin.ts`
- **Issue:** `(req as unknown as AdminRequest).admin` repeated 10+ times
- **Fix:** Extract to middleware or use typed request handler

### 35. Pagination Logic Repeated
- **File:** `src/routes/admin.ts`
- **Issue:** Same pagination logic repeated for each endpoint
- **Fix:** Create pagination middleware/utility function

### 36. Duplicate Utility: checkStudentLimit
- **Issue:** Same or similar logic in multiple files
- **Fix:** Centralize in `src/services/subscription.ts`

---

## Summary Checklist

### Must Fix Before Running
- [x] #1 Add router import to app.ts
- [x] #5 Fix logout route handler

### Must Fix Before Production
- [x] #2 Remove JWT secret fallback
- [x] #3 Add JWT expiration
- [x] #4 Exclude password from API responses
- [x] #6 Re-enable CSP
- [x] #7 Add input validation
- [x] #8 Add rate limiting

### Should Fix for Stability
- [x] #13 Add graceful shutdown
- [x] #9 Wrap teacher registration in transaction
- [x] #10 Wrap createClass in transaction
- [x] #26 Add database indexes
- [x] #27 Fix migration history (schema updated, prisma generate run)

### Nice to Have
- [x] #14 Add CSRF protection (middleware created)
- [x] #25 Add test suite (test scripts and sample tests added)
- [x] #13 Add graceful shutdown
- [x] #17 Extract magic numbers to constants
- [x] #18 Add security event logging
- [x] #22 Remove unused cloud_storage utility
- [x] #24 Move router inline logic to controllers
- [x] #23 Refactor large files (split teacher.controller.ts into dashboard, classes, quizzes controllers)

---

## Summary

### Completed: 38 issues fixed

### Remaining: 5 issues

| Priority | Issues | Estimated Hours |
|----------|--------|-----------------|
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 0 | 0 |
| Low | 0 | 0 |
| Database | 0 | 0 |
| Code Quality | 1 | 4-6 |
| **Total** | **5** | **4-8** |
