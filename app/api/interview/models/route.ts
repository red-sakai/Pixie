import { NextResponse } from "next/server";

type ModelInfo = {
  name?: string;
  supportedGenerationMethods?: string[];
  displayName?: string;
  description?: string;
};

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY in environment." },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Failed to list models: ${res.status} ${text}` },
        { status: 500 }
      );
    }

    const json = (await res.json()) as { models?: ModelInfo[] };
    const models = json.models ?? [];
    return NextResponse.json({
      models: models.map((m) => ({
        name: m.name,
        supportedGenerationMethods: m.supportedGenerationMethods,
        displayName: m.displayName,
        description: m.description,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list models.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
