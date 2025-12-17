import { NextResponse } from "next/server";

type RequestBody = {
  transcript: string;
};

type ListedModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

type GeminiPart = { text: string };

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiGenerateRequest = {
  contents: GeminiContent[];
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

let cachedModelName: string | null = null;
let cachedModelAt = 0;

function stripModelsPrefix(name: string) {
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

function scoreModelName(name: string) {
  const n = name.toLowerCase();
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

async function resolveModelName(apiKey: string) {
  const envModel = process.env.GEMINI_CLOSING_MODEL ?? process.env.GEMINI_MODEL;
  if (envModel) return envModel;

  const now = Date.now();
  if (cachedModelName && now - cachedModelAt < 60 * 60 * 1000) return cachedModelName;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
      apiKey
    )}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to list models (${res.status}). Set GEMINI_CLOSING_MODEL explicitly. ${text}`
    );
  }

  const json = (await res.json()) as { models?: ListedModel[] };
  const models = json.models ?? [];

  const candidates = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => stripModelsPrefix(String(m.name ?? "")))
    .filter(Boolean)
    .filter((n) => n.startsWith("gemini"))
    .filter((n) => !isTtsModel(n));

  const filtered = candidates.filter((n) => !isAppletsModel(n));

  filtered.sort((a, b) => scoreModelName(b) - scoreModelName(a));

  const picked = filtered[0] ?? "";
  if (!picked) {
    throw new Error(
      "No generateContent-capable models found. Call /api/interview/models or set GEMINI_CLOSING_MODEL."
    );
  }

  cachedModelName = picked;
  cachedModelAt = now;
  return picked;
}

async function resolveModelCandidates(apiKey: string) {
  const preferred = process.env.GEMINI_CLOSING_MODEL ?? process.env.GEMINI_MODEL;
  const now = Date.now();
  if (cachedModelName && now - cachedModelAt < 60 * 60 * 1000) {
    return [cachedModelName];
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
      `Failed to list models (${res.status}). Set GEMINI_CLOSING_MODEL explicitly. ${text}`
    );
  }

  const json = (await res.json()) as { models?: ListedModel[] };
  const models = json.models ?? [];

  const candidates = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => stripModelsPrefix(String(m.name ?? "")))
    .filter(Boolean)
    .filter((n) => n.startsWith("gemini"))
    .filter((n) => !isTtsModel(n))
    .filter((n) => !isAppletsModel(n));

  candidates.sort((a, b) => scoreModelName(b) - scoreModelName(a));

  if (preferred) {
    const p = stripModelsPrefix(preferred);
    return [p, ...candidates.filter((m) => m !== p)];
  }

  return candidates;
}

function toModelPath(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
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

  const transcript = String(body.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "Missing transcript." }, { status: 400 });
  }

  try {
    const preferred = await resolveModelName(apiKey);
    const candidates = await resolveModelCandidates(apiKey);
    const models = [preferred, ...candidates.filter((m) => m !== preferred)].filter(Boolean);

    const system =
      "You are Pixie, an AI interviewer. Provide a short friendly closing statement and 2-3 bullet-less feedback points. " +
      "No markdown, no headings, plain text only.";

    const prompt =
      "Here is the interview transcript (Pixie and candidate). Provide a short closing statement and 2-3 feedback points:\n\n" +
      transcript;

    const requestBody: GeminiGenerateRequest = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${system}\n\n${prompt}` }],
        },
      ],
    };

    let lastError: string | null = null;
    let lastStatus = 500;

    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${toModelPath(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      const json = (await res.json()) as GeminiGenerateResponse;

      if (!res.ok) {
        lastStatus = res.status;
        lastError = json.error?.message ?? "Gemini closing failed.";
        if (res.status === 429 || isUnsupportedModelError(lastError)) continue;
        return NextResponse.json(
          { error: lastError, status: res.status, model },
          { status: res.status }
        );
      }

      const text =
        json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          ?.trim() ?? "";

      if (!text) {
        return NextResponse.json(
          { error: "Gemini returned an empty closing." },
          { status: 500 }
        );
      }

      cachedModelName = model;
      cachedModelAt = Date.now();
      return NextResponse.json({ closing: text, model });
    }

    const finalStatus = lastStatus === 429 ? 429 : 500;
    return NextResponse.json(
      {
        error:
          lastError ??
          (finalStatus === 429
            ? "Quota exceeded for closing."
            : "No supported model accepted the closing request."),
        status: lastStatus,
      },
      { status: finalStatus }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gemini closing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
