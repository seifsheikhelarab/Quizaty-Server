import "dotenv/config";
import prisma from "../prisma";
import bcrypt from "bcrypt";
import { faker } from "@faker-js/faker";

const HASHED_PASSWORD = bcrypt.hashSync("password123", 10);

const SHORT_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const shortCodesByClass = new Map<string, Set<string>>();

const generateShortCodeForClass = (classId: string): string => {
    let used = shortCodesByClass.get(classId);
    if (!used) {
        used = new Set<string>();
        shortCodesByClass.set(classId, used);
    }

    while (true) {
        const code = Array.from({ length: 4 }, () => SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)]).join("");
        if (!used.has(code)) {
            used.add(code);
            return code;
        }
    }
};

async function main() {
    console.log("🌱 Seeding database...");

    // Clear existing data (order matters for foreign keys)
    await prisma.subscription.deleteMany();
    await prisma.admin.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.question.deleteMany();
    await prisma.quiz.deleteMany();
    await prisma.class.deleteMany();
    await prisma.student.deleteMany();
    await prisma.teacher.deleteMany();

    // Create teachers
    const teacherCount = 3;
    const teachers = await Promise.all(
        Array.from({ length: teacherCount }, async () =>
            prisma.teacher.create({
                data: {
                    email: faker.internet.email().toLowerCase(),
                    password: HASHED_PASSWORD,
                    name: faker.person.fullName(),
                    phone: faker.phone.number({ style: "international" }),
                },
            })
        )
    );
    console.log(`  ✓ Created ${teachers.length} teachers`);

    // Create classes (2-3 per teacher)
    const allClasses: { id: string; teacherId: string }[] = [];
    for (const teacher of teachers) {
        const count = faker.number.int({ min: 2, max: 3 });
        for (let i = 0; i < count; i++) {
            const c = await prisma.class.create({
                data: {
                    name: faker.helpers.arrayElement([
                        "Grade 10 Math",
                        "Grade 11 Physics",
                        "Grade 9 Biology",
                        "Algebra I",
                        "Chemistry 101",
                        "Geometry",
                    ]) + ` - ${faker.string.alpha(3).toUpperCase()}`,
                    description: faker.lorem.sentence(),
                    teacherId: teacher.id,
                },
            });
            allClasses.push(c);
        }
    }
    console.log(`  ✓ Created ${allClasses.length} classes`);

    // Create students and assign to classes
    const studentCount = 25;
    const students: { id: string }[] = [];
    const usedPhones = new Set<string>();

    for (let i = 0; i < studentCount; i++) {
        let phone: string;
        do {
            phone = faker.phone.number({ style: "international" });
        } while (usedPhones.has(phone));
        usedPhones.add(phone);

        const classForStudent = faker.helpers.arrayElement(allClasses);
        const student = await prisma.student.create({
            data: {
                name: faker.person.fullName(),
                phone,
                password: HASHED_PASSWORD,
                parentPhone: faker.phone.number({ style: "international" }),
                classId: classForStudent.id,
                shortCode: generateShortCodeForClass(classForStudent.id),
            },
        });
        students.push(student);
    }
    console.log(`  ✓ Created ${students.length} students`);

    // Create quizzes with questions and assign to classes
    const quizTitles = [
        "Algebra Basics",
        "Quadratic Equations",
        "Trigonometry Intro",
        "Cell Biology",
        "Newton's Laws",
        "Chemical Reactions",
        "Geometry Proofs",
    ];

    for (const teacher of teachers) {
        const quizCount = faker.number.int({ min: 2, max: 4 });
        for (let q = 0; q < quizCount; q++) {
            const now = new Date();
            const startOffset = faker.number.int({ min: -7, max: 14 }) * 24 * 60 * 60 * 1000;
            const startTime = new Date(now.getTime() + startOffset);
            const endTime = new Date(startTime.getTime() + 3 * 24 * 60 * 60 * 1000);

            const classIds = faker.helpers
                .arrayElements(
                    allClasses.filter((c) => c.teacherId === teacher.id),
                    { min: 1, max: 2 }
                )
                .map((c) => c.id);

            const questionCount = faker.number.int({ min: 3, max: 6 });
            const questions = Array.from({ length: questionCount }, () => {
                const options = [
                    faker.lorem.sentence(),
                    faker.lorem.sentence(),
                    faker.lorem.sentence(),
                    faker.lorem.sentence(),
                ];
                return {
                    questionText: faker.lorem.sentence() + "?",
                    options,
                    correctOption: faker.number.int({ min: 0, max: 3 }),
                };
            });

            const totalMarks = questionCount * 10;

            await prisma.quiz.create({
                data: {
                    title: faker.helpers.arrayElement(quizTitles) + ` - ${faker.date.month()}`,
                    description: faker.lorem.paragraph(),
                    startTime,
                    endTime,
                    duration: faker.number.int({ min: 15, max: 45 }),
                    totalMarks,
                    teacherId: teacher.id,
                    classes: { connect: classIds.map((id) => ({ id })) },
                    questions: {
                        create: questions.map((q) => ({
                            questionText: q.questionText,
                            options: q.options,
                            correctOption: q.correctOption,
                        })),
                    },
                },
            });
        }
    }
    const quizCount = await prisma.quiz.count();
    console.log(`  ✓ Created ${quizCount} quizzes with questions`);

    // Create some submissions
    const quizzes = await prisma.quiz.findMany({
        include: { questions: true, classes: true },
    });

    let submissionCount = 0;
    for (const quiz of quizzes) {
        const classIds = quiz.classes.map((c) => c.id);
        const studentsInClass = await prisma.student.findMany({
            where: { classId: { in: classIds } },
        });

        const submitters = faker.helpers.arrayElements(studentsInClass, {
            min: 0,
            max: Math.min(studentsInClass.length, 5),
        });

        for (const student of submitters) {
            const answers: Record<string, number> = {};
            quiz.questions.forEach((q) => {
                answers[q.id] = faker.helpers.arrayElement([
                    q.correctOption,
                    faker.number.int({ min: 0, max: 3 }),
                ]);
            });

            const score = quiz.questions.reduce((sum, q) => {
                return sum + (answers[q.id] === q.correctOption ? quiz.totalMarks / quiz.questions.length : 0);
            }, 0);

            await prisma.submission.create({
                data: {
                    studentId: student.id,
                    quizId: quiz.id,
                    score: Math.round(score),
                    submittedAt: faker.date.recent({ days: 7 }),
                    answers: answers as object,
                },
            });
            submissionCount++;
        }
    }
    console.log(`  ✓ Created ${submissionCount} submissions`);

    // Create a known test teacher and student for easy login
    const testTeacher = await prisma.teacher.create({
        data: {
            email: "teacher@test.com",
            password: HASHED_PASSWORD,
            name: "Test Teacher",
            phone: "+15550000001",
        },
    });

    const testClass = await prisma.class.create({
        data: {
            name: "Test Class",
            description: "For testing",
            teacherId: testTeacher.id,
        },
    });

    const _testStudent = await prisma.student.create({
        data: {
            name: "Test Student",
            phone: "+15550000002",
            password: HASHED_PASSWORD,
            parentPhone: "+15550000003",
            classId: testClass.id,
            shortCode: generateShortCodeForClass(testClass.id),
        },
    });

    const _testQuiz = await prisma.quiz.create({
        data: {
            title: "Test Quiz",
            description: "A sample quiz for testing",
            startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            duration: 30,
            totalMarks: 100,
            teacherId: testTeacher.id,
            classes: { connect: [{ id: testClass.id }] },
            questions: {
                create: [
                    { questionText: "What is 2 + 2?", options: ["3", "4", "5", "6"], correctOption: 1 },
                    { questionText: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], correctOption: 2 },
                    { questionText: "How many days in a week?", options: ["5", "6", "7", "8"], correctOption: 2 },
                ],
            },
        },
    });

    console.log(`  ✓ Created test accounts`);

    // Create a default super admin
    await prisma.admin.create({
        data: {
            email: "admin@test.com",
            password: HASHED_PASSWORD,
            name: "Super Admin",
            role: "SUPER_ADMIN"
        }
    });
    console.log(`  ✓ Created super admin: admin@test.com`);

    // Create sample subscriptions for teachers
    for (const teacher of [...teachers, testTeacher]) {
        const tier = faker.helpers.arrayElement(['BASIC', 'PREMIUM']);
        const status = faker.helpers.arrayElement(['active', 'active', 'cancelled']);
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + faker.number.int({ min: 1, max: 12 }));

        await prisma.subscription.create({
            data: {
                teacherId: teacher.id,
                tier,
                status,
                expiresAt: status === 'active' ? expiresAt : null
            }
        });
    }
    console.log(`  ✓ Created sample subscriptions for all teachers`);

    console.log("\n✅ Seeding complete!");
    console.log("\nTest login credentials (password: password123):");
    console.log("  Teacher: teacher@test.com");
    console.log("  Student: +15550000002");
    console.log("  Admin:   admin@test.com");
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
