import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { INTERVIEW_QUESTIONS } from "@/lib/interviewQuestions";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  history?: ChatMessage[];
  questionIndex?: number;
};

type ListedModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

let cachedModelName: string | null = null;
let cachedModelAt = 0;

function stripModelsPrefix(name: string) {
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

function scoreModelName(name: string) {
  const n = name.toLowerCase();
  // Prefer fast chat-capable models.
  if (n.includes("flash")) return 100;
  if (n.includes("pro")) return 80;
  return 50;
}

function isTtsModel(name: string) {
  return name.toLowerCase().includes("tts");
}

function isAppletsModel(name: string) {
  return name.toLowerCase().includes("applet");
}

function isUnsupportedModelError(message: string | undefined) {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("is not found for api version") ||
    m.includes("not supported for generatecontent")
  );
}

async function resolveModelCandidates() {
  const envModel = process.env.GEMINI_MODEL;

  const now = Date.now();
  if (cachedModelName && now - cachedModelAt < 60 * 60 * 1000) {
    return [cachedModelName];
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment.");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
      apiKey
    )}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to list models (${res.status}). Set GEMINI_MODEL explicitly or call /api/interview/models. ${text}`
    );
  }

  const json = (await res.json()) as { models?: ListedModel[] };
  const models = json.models ?? [];

  const candidates = models
    .filter((m) =>
      Array.isArray(m.supportedGenerationMethods)
        ? m.supportedGenerationMethods.includes("generateContent")
        : false
    )
    .map((m) => stripModelsPrefix(String(m.name ?? "")))
    .filter(Boolean)
    .filter((n) => !isTtsModel(n))
    .filter((n) => !isAppletsModel(n));

  const geminiCandidates = candidates.filter((n) => n.startsWith("gemini"));
  const pickFrom = geminiCandidates.length > 0 ? geminiCandidates : candidates;

  pickFrom.sort((a, b) => scoreModelName(b) - scoreModelName(a));

  if (envModel) {
    const env = stripModelsPrefix(envModel);
    return [env, ...pickFrom.filter((m) => m !== env)];
  }

  if (!pickFrom[0]) {
    throw new Error(
      "No generateContent-capable models found. Call /api/interview/models to inspect available models, or set GEMINI_MODEL."
    );
  }

  return pickFrom;
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY in environment." },
      { status: 500 }
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const questionIndex = Math.max(0, Number(body.questionIndex ?? 0));
  const history = Array.isArray(body.history) ? body.history : [];

  const nextQuestion = INTERVIEW_QUESTIONS[questionIndex];
  const isDone = questionIndex >= INTERVIEW_QUESTIONS.length;

  const systemInstruction =
    "You are Pixie, an AI interviewer. Keep a professional, friendly tone. " +
    "Ask exactly one question at a time. Do not mention any hidden question list. " +
    "Do not include markdown. Keep it concise.";

  const prompt = isDone
    ? "The interview questions are complete. Give a short closing statement and thank the candidate."
    : `Ask the candidate the next interview question: "${nextQuestion}". ` +
      "If the candidate just answered something, briefly acknowledge it in one short sentence, " +
      "then ask the next question. Do not ask multiple questions.";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const candidates = await resolveModelCandidates();

    const contents = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Add our instruction as the final user turn.
    contents.push({ role: "user", parts: [{ text: prompt }] });

    let lastErr: string | null = null;
    for (const modelName of candidates) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
        });

        const result = await model.generateContent({ contents });
        const text = result.response.text().trim();

        cachedModelName = modelName;
        cachedModelAt = Date.now();

        return NextResponse.json({
          message: text,
          done: isDone,
          model: modelName,
          askedQuestionIndex: isDone ? null : questionIndex,
          nextQuestionIndex: isDone ? questionIndex : questionIndex + 1,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = msg;
        if (isUnsupportedModelError(msg)) continue;
        throw e;
      }
    }

    throw new Error(
      lastErr ??
        "No supported model accepted the request. Call /api/interview/models or set GEMINI_MODEL."
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to call Gemini.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
