# Quizaty-Server

This file contains guidelines and commands for AI agents working on this codebase.

## Build & Run Commands

```bash
# Development server with hot-reload
bun run dev

# Start production server
bun run start

# Database seeding (generates fake data)
bun run seed

# Linting (auto-fix)
bun run lint
```

## Testing

Currently no test framework is configured. When adding tests, use `bun test` (Bun's built-in test runner).  
To run a single test file: `bun test path/to/file.test.ts`.  
To run a specific test: `bun test --test-name-pattern "test name"`.

## Code Style Guidelines

### Imports
- Use ES module syntax (`import`/`export`).
- Add `.js` extensions for relative imports (e.g., `'./utils.js'`).
- Use `import type` for type-only imports.
- Group imports: Node built‑ins, external packages, internal modules.

### Formatting
- No Prettier; rely on ESLint (see `eslint.config.ts`).
- Use 2 spaces for indentation.
- Semicolons are optional (Bun default).
- Single quotes for strings.
- Trailing commas in multiline objects/arrays.

### Types
- Enable strict TypeScript (`strict: true` in tsconfig).
- Prefer `unknown` over `any`.
- Use explicit return types for exported functions when clarity is needed.
- Define interfaces/types in the same file they are used, or in a dedicated `types.ts` file.

### Naming Conventions
- Variables, functions, parameters: `camelCase`.
- Types, interfaces, classes: `PascalCase`.
- Constants: `UPPER_SNAKE_CASE` (if truly constant).
- File names: `kebab-case.ts` (e.g., `auth.controller.ts`), except for React components.

### Error Handling
- Wrap async route handlers in `try/catch`.
- Log errors with `console.error` before sending a response.
- Use appropriate HTTP status codes (400, 401, 403, 404, 500).
- Centralized error handler in `src/middleware/errorHandler.ts`.

### Express Patterns
- Use separate router files (`*.router.ts`) and controller files (`*.controller.ts`).
- Export the router as default.
- Use middleware functions for authentication/authorization (see `src/middleware.ts`).

### Prisma
- Use the Prisma client singleton from `src/prisma.ts`.
- Avoid raw SQL; use Prisma’s query API.
- Run migrations with `npx prisma migrate dev`.
- Use `include` to eagerly load relationships (e.g., `class.students`).
- Use transactions for multiple writes (`prisma.$transaction([...])`).
- Prefer `createMany`/`upsert` for bulk operations when possible.

### Environment Variables
- Use `.env` files (never commit them).
- Access via `process.env`; provide fallbacks for development.

## Architecture Overview

- **Entry**: `src/index.ts` → `src/app.ts`
- **API routes**: `src/api/` (organized by domain)
- **Server‑rendered views**: `src/routes/` (EJS templates)
- **Business logic**: `src/services/`
- **Middleware**: `src/middleware/`
- **Database**: Prisma ORM (`prisma/schema.prisma`)

## Project Structure

```
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Database migrations
├── public/                    # Static assets (CSS, images)
├── src/
│   ├── api/                   # REST API endpoints
│   │   ├── auth/              # Authentication (login, register, logout)
│   │   ├── classes/           # Class management
│   │   ├── student/           # Student-specific endpoints
│   │   ├── teacher/           # Teacher-specific endpoints
│   │   └── index.ts           # Main API router
│   ├── middleware/             # Express middleware
│   │   ├── apiAuth.ts         # API authentication
│   │   └── errorHandler.ts    # Centralized error handling
│   ├── routes/                # Server-rendered routes (EJS)
│   ├── services/              # Business logic
│   │   ├── class.ts           # Class-related utilities
│   │   ├── cloudinary.ts      # Cloudinary integration
│   │   └── subscription.ts    # Subscription plans
│   ├── utils/                 # Helper functions
│   ├── app.ts                 # Express app setup
│   ├── index.ts               # Server entry point
│   ├── middleware.ts           # Auth middleware (teacher/student/admin)
│   └── prisma.ts              # Prisma client singleton
├── views/                     # EJS templates
├── eslint.config.ts           # ESLint configuration
├── package.json               # Project metadata and scripts
├── prisma.config.ts           # Prisma configuration
└── tsconfig.json              # TypeScript configuration
```

## Database Commands

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create a new migration
npx prisma migrate dev --name migration_name

# Reset database (warning: destructive)
npx prisma migrate reset

# View database in Prisma Studio
npx prisma studio
```

## Common Tasks

### Adding a New API Endpoint
1. Create a controller file in `src/api/<domain>/` (e.g., `user.controller.ts`).
2. Export async functions that handle requests.
3. Create a router file in the same directory (e.g., `user.router.ts`).
4. Import the controller and define routes.
5. Export the router as default.
6. Register the router in `src/api/index.ts` with `router.use('/path', userRouter)`.

### Adding a New Service
1. Create a new file in `src/services/`.
2. Export functions that encapsulate business logic.
3. Use Prisma client for database operations.
4. Throw custom errors (see `src/utils/errors.ts`) for expected failures.

### Error Handling Pattern
```typescript
try {
  // operation
} catch (error) {
  console.error("Description:", error);
  res.status(500).json({ error: 'User-friendly message' });
}
```

### Authentication Middleware
- `authenticateTeacher` – expects JWT in `token` cookie.
- `authenticateStudent` – expects JWT in `token` cookie.
- `authenticateAdmin` – expects JWT in `admin_token` cookie.
- `requireSuperAdmin` – checks admin role (must be used after `authenticateAdmin`).

## Additional Notes

- This project uses Bun as the runtime (not Node.js). Ensure compatibility.
- The codebase is ESM‑first; avoid CommonJS patterns.
- When adding new dependencies, run `bun add <package>` (not npm).
- Follow existing patterns for route handling, error responses, and data validation.
- Keep changes minimal and focused; do not refactor unrelated code unless instructed.
- Run `bun run lint` before committing to ensure code style consistency.
- When modifying the database schema, remember to run `npx prisma generate` and `npx prisma migrate dev`.
