import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import prisma from "../prisma.js";

if (!process.env.GEMINI_API_KEY) {
    throw new Error("Provide Gemini API Key in Environment Variables!!!")
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

export interface ExtractedQuestion {
    questionText: string;
    options: string[];
    correctOption: number;
    imageUrl?: string;
}

export interface ExtractResult {
    questions: ExtractedQuestion[];
    rawText?: string;
    errors?: string[];
}

const PROMPT_TEMPLATE = `You are an expert at extracting multiple choice questions from images. 
Extract ALL questions from this image. Each question should have:
1. The question text
2. 4 options (A, B, C, D)
3. The correct answer (0 for A, 1 for B, 2 for C, 3 for D)

Return the questions in JSON format like this:
{
  "questions": [
    {
      "questionText": "What is 2+2?",
      "options": ["3", "4", "5", "6"],
      "correctOption": 1
    }
  ]
}

Rules:
- If an image doesn't contain questions, return an empty questions array
- If a question has fewer than 4 options, use empty strings for missing ones
- The correctOption must be 0, 1, 2, or 3
- Preserve the original question text exactly as shown
- Handle both Arabic and English text
- If the image is unclear or no questions are visible, return an empty array
- Do NOT make up questions - only extract what is actually visible in the image`;

export async function extractQuestionsFromImage(imageBuffer: Buffer): Promise<ExtractResult> {
    try {
        const base64Data = imageBuffer.toString('base64');
        const mimeType = detectMimeType(imageBuffer);

        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [
                    { inlineData: { mimeType, data: base64Data } },
                    { text: PROMPT_TEMPLATE }
                ]
            }],
            safetySettings,
            generationConfig: {
                temperature: 0.1,
                topK: 32,
                topP: 0.95,
                maxOutputTokens: 8192,
            }
        });

        const response = result.response;
        const text = response.text();

        return parseGeminiResponse(text);
    } catch (error: unknown) {
        console.error("OCR extraction error:", error);
        return {
            questions: [],
            errors: [error instanceof Error ? error.message : "Failed to extract questions from image"]
        };
    }
}

export async function extractQuestionsFromUrl(imageUrl: string): Promise<ExtractResult> {
    try {
        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [
                    { text: `Extract questions from this image URL: ${imageUrl}` },
                    { text: PROMPT_TEMPLATE }
                ]
            }],
            safetySettings,
            generationConfig: {
                temperature: 0.1,
                topK: 32,
                topP: 0.95,
                maxOutputTokens: 8192,
            }
        });

        const response = result.response;
        const text = response.text();

        return parseGeminiResponse(text);
    } catch (error: unknown) {
        console.error("OCR extraction error:", error);
        return {
            questions: [],
            errors: [error instanceof Error ? error.message : "Failed to extract questions from image URL"]
        };
    }
}

function parseGeminiResponse(text: string): ExtractResult {
    const errors: string[] = [];

    try {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        let jsonStr: string = jsonMatch ? (jsonMatch[1] ?? text) : text;

        const startIdx = jsonStr.indexOf('{');
        const endIdx = jsonStr.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1) {
            jsonStr = jsonStr.substring(startIdx, endIdx + 1);
        }

        const parsed = JSON.parse(jsonStr);

        if (!parsed.questions || !Array.isArray(parsed.questions)) {
            return { questions: [], rawText: text };
        }

        const questions: ExtractedQuestion[] = parsed.questions.map((q: Record<string, unknown>, index: number) => {
            if (!q.questionText) {
                errors.push(`Question ${index + 1} is missing question text`);
                return null;
            }

            const questionText = String(q.questionText);
            const options = normalizeOptions(q.options);
            let correctOption = parseInt(String(q.correctOption));

            if (isNaN(correctOption) || correctOption < 0 || correctOption > 3) {
                errors.push(`Question "${questionText.substring(0, 50)}..." has invalid correctOption, defaulting to 0`);
                correctOption = 0;
            }

            return {
                questionText: questionText.trim(),
                options,
                correctOption
            };
        }).filter(Boolean);

        return { questions, rawText: text, errors: errors.length > 0 ? errors : undefined };
    } catch (error: unknown) {
        errors.push(`Failed to parse response: ${error instanceof Error ? error.message : String(error)}`);
        return { questions: [], rawText: text, errors };
    }
}

function normalizeOptions(options: unknown): string[] {
    if (!options) return ["", "", "", ""];
    if (Array.isArray(options) && options.length === 4) {
        return options.map((opt: string) => String(opt).trim());
    }
    if (Array.isArray(options)) {
        while (options.length < 4) options.push("");
        return options.slice(0, 4).map((opt: string) => String(opt).trim());
    }
    if (typeof options === 'object') {
        const result: string[] = ["", "", "", ""];
        const obj = options as Record<string, unknown>;
        if (obj.A !== undefined) result[0] = String(obj.A).trim();
        if (obj.B !== undefined) result[1] = String(obj.B).trim();
        if (obj.C !== undefined) result[2] = String(obj.C).trim();
        if (obj.D !== undefined) result[3] = String(obj.D).trim();
        return result;
    }
    return ["", "", "", ""];
}

function detectMimeType(buffer: Buffer): string {
    if (buffer.length < 4) return "application/octet-stream";

    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return "image/png";
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "application/pdf";
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return "image/bmp";
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "image/webp";

    return "application/octet-stream";
}

export async function saveQuestionsToBank(
    teacherId: string,
    questions: ExtractedQuestion[]
): Promise<{ saved: number; questions: unknown[] }> {
    const savedQuestions = await prisma.bankQuestion.createMany({
        data: questions.map(q => ({
            questionText: q.questionText,
            options: q.options,
            correctOption: q.correctOption,
            imageUrl: q.imageUrl || null,
            teacherId
        }))
    });

    const questionsList = await prisma.bankQuestion.findMany({
        where: {
            teacherId,
            createdAt: { gte: new Date(Date.now() - 60000) }
        },
        orderBy: { createdAt: 'desc' },
        take: questions.length
    });

    return { saved: savedQuestions.count, questions: questionsList };
}

export async function extractAndSaveQuestions(
    teacherId: string,
    imageBuffer: Buffer,
    imageUrl?: string
): Promise<{ saved: number; questions: ExtractedQuestion[]; errors?: string[] }> {
    const result = await extractQuestionsFromImage(imageBuffer);

    if (result.questions.length === 0) {
        return { saved: 0, questions: [], errors: result.errors };
    }

    const questionsWithUrl = result.questions.map(q => ({
        ...q,
        imageUrl: imageUrl || undefined
    }));

    await saveQuestionsToBank(teacherId, questionsWithUrl);

    return {
        saved: result.questions.length,
        questions: questionsWithUrl,
        errors: result.errors
    };
}
