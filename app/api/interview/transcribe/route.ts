import { NextResponse } from "next/server";

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

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

function toModelPath(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

function isTtsModel(name: string) {
  return name.toLowerCase().includes("tts");
}

function isAppletsModel(name: string) {
  const n = name.toLowerCase();
  return n.includes("applet");
}

function isAudioModalityError(message: string | undefined) {
  if (!message) return false;
  return message.toLowerCase().includes("audio input modality is not enabled");
}

function isUnsupportedModelError(message: string | undefined) {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("is not found for api version") ||
    m.includes("not supported for generatecontent")
  );
}

function parseRetrySeconds(message: string | undefined) {
  if (!message) return null;
  const m = message.match(/retry in\s+([0-9.]+)s/i);
  if (!m) return null;
  const seconds = Number(m[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

function normalizeModelName(name: string) {
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

async function getCandidateModels(apiKey: string) {
  const preferred = process.env.GEMINI_TRANSCRIBE_MODEL;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
      apiKey
    )}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list models (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    models?: Array<{
      name?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  const candidates = (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => String(m.name ?? ""))
    .filter(Boolean)
    .map((n) => normalizeModelName(n))
    .filter((n) => n.startsWith("gemini"))
    // Exclude TTS-only models which don't accept audio input.
    .filter((n) => !isTtsModel(n))
    // Exclude applets-style preview models (often not usable with generateContent).
    .filter((n) => !isAppletsModel(n));

  const score = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("flash")) return 100;
    if (n.includes("pro")) return 80;
    return 50;
  };

  candidates.sort((a, b) => score(b) - score(a));

  // Put explicitly configured model first.
  if (preferred) {
    const normalized = normalizeModelName(preferred);
    return [normalized, ...candidates.filter((m) => m !== normalized)];
  }

  if (!candidates[0]) {
    throw new Error(
      "No suitable Gemini models found for generateContent. Set GEMINI_TRANSCRIBE_MODEL explicitly."
    );
  }

  return candidates;
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY in environment." },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'audio' file in form-data." },
      { status: 400 }
    );
  }

  const mimeType = audio.type || "audio/webm";
  const bytes = Buffer.from(await audio.arrayBuffer());
  const data = bytes.toString("base64");

  try {
    const models = await getCandidateModels(apiKey);

    const contents: GeminiContent[] = [
      {
        role: "user",
        parts: [
          {
            text: "Transcribe the following audio into plain text. Return only the transcript, no extra commentary.",
          },
          { inlineData: { mimeType, data } },
        ],
      },
    ];

    const body: GeminiGenerateRequest = { contents };

    let lastError: string | null = null;
    let lastStatus = 500;
    let lastModel: string | null = null;
    let retryAfterSeconds: number | null = null;

    for (const model of models) {
      lastModel = model;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${toModelPath(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const json = (await res.json()) as GeminiGenerateResponse;

      if (!res.ok) {
        lastStatus = res.status;
        lastError = json.error?.message ?? "Transcription failed.";
        retryAfterSeconds = parseRetrySeconds(lastError) ?? retryAfterSeconds;

        // If this model is quota-limited OR doesn't support audio input, try another model.
        if (
          res.status === 429 ||
          isAudioModalityError(lastError) ||
          isUnsupportedModelError(lastError)
        )
          continue;

        return NextResponse.json(
          { error: lastError, model },
          { status: 500 }
        );
      }

      const text =
        json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          ?.trim() ?? "";

      if (!text) {
        return NextResponse.json(
          { error: "Transcription returned empty text.", model },
          { status: 500 }
        );
      }

      return NextResponse.json({ transcript: text, model });
    }

    const finalStatus = lastStatus === 429 ? 429 : 500;
    return NextResponse.json(
      {
        error:
          lastError ??
          (finalStatus === 429
            ? "Quota exceeded for transcription."
            : "No supported model accepted the transcription request."),
        status: lastStatus,
        model: lastModel,
        retryAfterSeconds,
      },
      { status: finalStatus }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
