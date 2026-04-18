# ⚙️ Quizaty Server

The backend engine for Quizaty, providing a robust REST API for quiz management, student tracking, and AI-powered question extraction. Built with **Bun**, **Express**, and **Prisma**.

## ✨ Features

- 🔑 **Authentication**: Secure multi-role auth (Teacher, Assistant, Student, Admin).
- 🗄️ **Prisma ORM**: Type-safe database queries with PostgreSQL.
- 🤖 **AI Integration**: Question extraction from images/PDFs using Google Generative AI (Gemini).
- ☁️ **Media Management**: Image uploads handled via Cloudinary.
- 📈 **Subscription Logic**: Tier-based limits for classes, students, and quiz features.
- 🛡️ **Security**: Rate limiting, helmet protection, and centralized error handling.

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (Required runtime)
- PostgreSQL database

### Installation

```bash
# Navigate to server directory
cd Quizaty/Quizaty-Server

# Install dependencies
bun install
```

### Database Setup

1. Configure your database URL in `.env`.
2. Run migrations:

```bash
npx prisma migrate dev
```

3. (Optional) Seed the database with fake data:

```bash
bun run seed
```

### Development

```bash
# Start development server with hot-reload
bun run dev
```

The API will be available at `http://localhost:7492`.

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Express 5](https://expressjs.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **AI**: [Google Gemini AI](https://ai.google.dev/)
- **Cloud**: [Cloudinary](https://cloudinary.com/)

## 📦 Project Structure

```text
src/
├── api/            # REST API controllers and routers
├── middleware/     # Auth and error handling middleware
├── services/       # Business logic (Subscriptions, Cloudinary, AI)
├── scripts/        # Database seeding scripts
├── app.ts          # Express application setup
└── index.ts        # Server entry point
```

> [!IMPORTANT]
> This project is designed to run exclusively with the **Bun** runtime. Using Node.js may lead to unexpected behavior.

## 📜 API Documentation

The API is organized into several domains:
- `/api/auth`: Login, registration, and logout.
- `/api/classes`: Class and student management.
- `/api/teacher`: Teacher-specific dashboard data.
- `/api/student`: Student quiz attempts and results.
