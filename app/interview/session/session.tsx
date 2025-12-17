"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Container from "@/app/components/ui/Container";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { INTERVIEW_QUESTIONS } from "@/lib/interviewQuestions";

type TranscribeResponse = {
  transcript?: string;
  model?: string;
  error?: string;
  status?: number;
  retryAfterSeconds?: number | null;
};

type Role = "assistant" | "user";

type Message = {
  role: Role;
  content: string;
};

type FollowupResponse = {
  followup?: string;
  model?: string;
  error?: string;
  status?: number;
};

type ClosingResponse = {
  closing?: string;
  model?: string;
  error?: string;
  status?: number;
};

type Phase = "base" | "followup" | "closing" | "done";

function formatError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

export default function InterviewSession() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [baseQuestionIndex, setBaseQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("base");
  const [followupsUsed, setFollowupsUsed] = useState(0);

  const MAX_FOLLOWUPS = 2;

  const [recordingSupported, setRecordingSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const spokenRef = useRef<string | null>(null);
  const [ttsVoice, setTtsVoice] = useState<SpeechSynthesisVoice | null>(null);

  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!supabase) {
        setCheckingSession(false);
        setSessionError("Supabase is not configured.");
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!data.session) {
          router.replace("/login");
          return;
        }

        setCheckingSession(false);
      } catch (e) {
        setCheckingSession(false);
        setSessionError(formatError(e));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setRecordingSupported(false);
    }

    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;

      if (audioStreamRef.current) {
        for (const t of audioStreamRef.current.getTracks()) t.stop();
        audioStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;

    const pickGirlVoice = (voices: SpeechSynthesisVoice[]) => {
      const preferredFragments = [
        "female",
        "woman",
        "girl",
        // Common platform voices often perceived as feminine
        "samantha",
        "victoria",
        "zira",
        "karen",
        "tessa",
        "moira",
      ];

      const isEnglish = (v: SpeechSynthesisVoice) =>
        (v.lang || "").toLowerCase().startsWith("en");

      const score = (v: SpeechSynthesisVoice) => {
        const name = (v.name || "").toLowerCase();
        const uri = (v.voiceURI || "").toLowerCase();
        const lang = (v.lang || "").toLowerCase();

        let s = 0;
        if (v.default) s += 1;
        if (isEnglish(v)) s += 10;
        if (lang.startsWith("en-us")) s += 2;
        if (lang.startsWith("en-gb")) s += 2;

        for (const frag of preferredFragments) {
          if (name.includes(frag) || uri.includes(frag)) s += 30;
        }

        // Small boost for well-known vendor voices.
        if (name.includes("google")) s += 3;
        if (name.includes("microsoft")) s += 2;

        // Avoid obviously male-labeled voices if present.
        if (name.includes("male")) s -= 20;

        return s;
      };

      const englishVoices = voices.filter(isEnglish);
      const pool = englishVoices.length ? englishVoices : voices;
      return pool.slice().sort((a, b) => score(b) - score(a))[0] ?? null;
    };

    const loadVoices = () => {
      const voices = synth.getVoices();
      setTtsVoice(pickGirlVoice(voices));
    };

    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
    // Older browsers only support onvoiceschanged.
    synth.onvoiceschanged = loadVoices;

    return () => {
      synth.removeEventListener?.("voiceschanged", loadVoices);
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    // Avoid re-speaking the same message on re-renders.
    if (spokenRef.current === text) return;
    spokenRef.current = text;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      // If no explicit feminine voice exists, a slightly higher pitch often helps.
      utterance.pitch = ttsVoice ? 1 : 1.15;
      if (ttsVoice) utterance.voice = ttsVoice;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore
    }
  }, [ttsVoice]);

  const addAssistantMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setMessages((prev) => [
        ...prev,
        { role: "assistant" as Role, content: trimmed },
      ]);
      speak(trimmed);
    },
    [speak]
  );

  const addUserMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { role: "user" as Role, content: trimmed }]);
  }, []);

  const wordCount = (text: string) =>
    text
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

  const shouldRequestGeminiFollowup = (answer: string, idx: number) => {
    if (followupsUsed >= MAX_FOLLOWUPS) return false;
    // Keep total interview near 6–8 questions: avoid follow-ups late in the list.
    if (idx >= Math.max(0, INTERVIEW_QUESTIONS.length - 2)) return false;

    const wc = wordCount(answer);
    if (wc < 10) return false;

    const lowered = answer.toLowerCase();
    if (lowered.includes("i don't know") || lowered.includes("not sure")) return false;

    return true;
  };

  const buildTranscript = (msgs: Message[]) =>
    msgs
      .map((m) => (m.role === "assistant" ? `Pixie: ${m.content}` : `Candidate: ${m.content}`))
      .join("\n");

  const askBaseQuestion = useCallback(
    (idx: number) => {
      const q = INTERVIEW_QUESTIONS[idx];
      if (!q) return;
      addAssistantMessage(q);
    },
    [addAssistantMessage]
  );

  const requestFollowup = useCallback(
    async (question: string, answer: string) => {
      setApiError(null);
      setSending(true);

      try {
        const res = await fetch("/api/interview/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, answer }),
        });

        const data = (await res.json()) as FollowupResponse;
        if (!res.ok || data.error) {
          throw new Error(data.error ?? "Follow-up service failed.");
        }

        const followup = (data.followup ?? "").trim();
        if (!followup) throw new Error("Gemini returned an empty follow-up.");

        setFollowupsUsed((n) => n + 1);
        setPhase("followup");
        addAssistantMessage(followup);
      } catch (e) {
        // If rate-limited or unavailable, just proceed without a follow-up.
        setApiError(formatError(e));
        setPhase("base");
        setBaseQuestionIndex((prev) => {
          const nextIdx = prev + 1;
          if (nextIdx >= INTERVIEW_QUESTIONS.length) {
            setDone(true);
            addAssistantMessage(
              "Thanks for your time. That concludes the interview."
            );
            return prev;
          }
          askBaseQuestion(nextIdx);
          return nextIdx;
        });
      } finally {
        setSending(false);
      }
    },
    [addAssistantMessage, askBaseQuestion]
  );

  const requestClosing = useCallback(
    async (msgs: Message[]) => {
      setApiError(null);
      setSending(true);
      setPhase("closing");

      try {
        const res = await fetch("/api/interview/closing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: buildTranscript(msgs) }),
        });

        const data = (await res.json()) as ClosingResponse;
        if (!res.ok || data.error) {
          throw new Error(data.error ?? "Closing service failed.");
        }

        const closing = (data.closing ?? "").trim();
        if (!closing) throw new Error("Gemini returned an empty closing.");

        addAssistantMessage(closing);
      } catch (e) {
        setApiError(formatError(e));
        addAssistantMessage(
          "Thanks for your time. That concludes the interview."
        );
      } finally {
        setSending(false);
        setDone(true);
        setPhase("done");
      }
    },
    [addAssistantMessage]
  );

  // Start interview on first load (after auth check).
  useEffect(() => {
    if (checkingSession) return;
    if (sessionError) return;
    if (messages.length > 0) return;

    setBaseQuestionIndex(0);
    setPhase("base");
    setFollowupsUsed(0);
    askBaseQuestion(0);
  }, [checkingSession, sessionError, messages.length, askBaseQuestion]);

  async function submitAnswer(text: string) {
    if (!text.trim() || done) return;

    const userText = text.trim();
    setTranscript("");
    addUserMessage(userText);

    // Capture a consistent view of the conversation for closing.
    const snapshot = [...messages, { role: "user" as Role, content: userText }];

    if (phase === "followup") {
      const nextIdx = baseQuestionIndex + 1;
      setPhase("base");

      if (nextIdx >= INTERVIEW_QUESTIONS.length) {
        await requestClosing(snapshot);
        return;
      }

      setBaseQuestionIndex(nextIdx);
      askBaseQuestion(nextIdx);
      return;
    }

    if (phase === "base") {
      const currentQ = INTERVIEW_QUESTIONS[baseQuestionIndex] ?? "";

      if (currentQ && shouldRequestGeminiFollowup(userText, baseQuestionIndex)) {
        await requestFollowup(currentQ, userText);
        return;
      }

      const nextIdx = baseQuestionIndex + 1;
      if (nextIdx >= INTERVIEW_QUESTIONS.length) {
        await requestClosing(snapshot);
        return;
      }

      setBaseQuestionIndex(nextIdx);
      askBaseQuestion(nextIdx);
      return;
    }

    if (phase === "closing" || phase === "done") {
      return;
    }
  }

  async function startRecording() {
    setApiError(null);
    setSpeechError(null);
    if (!recordingSupported) return;
    if (sending || done || recording) return;

    try {
      setTranscript("");
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstart = () => setRecording(true);
      recorder.onstop = () => setRecording(false);

      recorder.start();
    } catch (e) {
      setSpeechError(formatError(e));
    }
  }

  async function stopAndTranscribe() {
    setApiError(null);
    setSpeechError(null);
    if (!mediaRecorderRef.current) return;

    const recorder = mediaRecorderRef.current;

    await new Promise<void>((resolve) => {
      const originalOnStop = recorder.onstop;
      recorder.onstop = (ev) => {
        originalOnStop?.call(recorder, ev);
        resolve();
      };

      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });

    // Stop stream tracks.
    if (audioStreamRef.current) {
      for (const t of audioStreamRef.current.getTracks()) t.stop();
      audioStreamRef.current = null;
    }

    const blob = new Blob(chunksRef.current, {
      type: recorder.mimeType || "audio/webm",
    });
    chunksRef.current = [];
    mediaRecorderRef.current = null;

    if (blob.size < 1000) {
      setSpeechError("No audio captured. Try recording again.");
      return;
    }

    try {
      setSending(true);
      const form = new FormData();
      form.append("audio", blob, "answer.webm");

      const res = await fetch("/api/interview/transcribe", {
        method: "POST",
        body: form,
      });

      const data = (await res.json()) as TranscribeResponse;
      if (!res.ok || data.error) {
        const retry =
          typeof data.retryAfterSeconds === "number" && data.retryAfterSeconds > 0
            ? ` Try again in ~${Math.ceil(data.retryAfterSeconds)}s.`
            : "";
        throw new Error((data.error ?? "Transcription failed.") + retry);
      }

      const text = (data.transcript ?? "").trim();
      if (!text) throw new Error("Transcription returned empty text.");

      setTranscript(text);
      await submitAnswer(text);
    } catch (e) {
      setSpeechError(formatError(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Container className="py-16">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Interview session
              </h1>
              <p className="mt-2 text-sm text-foreground/75">
                Pixie will ask questions one at a time. The interviewer voice uses
                your browser’s TTS.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/interview/preview")}
              className="inline-flex items-center justify-center rounded-full border border-foreground/15 bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              Back to preview
            </button>
          </div>

          {checkingSession ? (
            <p className="mt-6 text-xs text-foreground/60">Checking session…</p>
          ) : null}
          {sessionError ? (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              {sessionError}
            </div>
          ) : null}
          {apiError ? (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              {apiError}
            </div>
          ) : null}
          {speechError ? (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              {speechError}
            </div>
          ) : null}

          <div className="mt-8 rounded-3xl border border-foreground/10 bg-background/70 p-5 backdrop-blur">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <p className="text-sm text-foreground/70">Loading…</p>
              ) : null}

              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={
                    m.role === "assistant"
                      ? "rounded-2xl border border-foreground/10 bg-background p-4"
                      : "rounded-2xl border border-foreground/10 bg-foreground/5 p-4"
                  }
                >
                  <p className="text-xs font-medium text-foreground/60">
                    {m.role === "assistant" ? "Pixie" : "You"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.content}</p>
                </div>
              ))}

              {done ? (
                <p className="text-sm text-foreground/70">
                  Interview complete. You can go back anytime.
                </p>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3">
              {!recordingSupported ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
                  Voice recording isn’t available in this browser.
                </div>
              ) : null}

              <div className="rounded-2xl border border-foreground/10 bg-background p-4">
                <p className="text-xs font-medium text-foreground/60">
                  Your answer (live transcript)
                </p>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder={done ? "Interview complete." : "Transcript will appear here…"}
                    disabled={done || sending}
                    className="mt-2 min-h-[4.5rem] w-full resize-none rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-foreground/20 disabled:opacity-60"
                  />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={recording ? stopAndTranscribe : startRecording}
                  disabled={!recordingSupported || sending || done}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-foreground/10 bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {recording ? "Stop & transcribe" : "Start speaking"}
                </button>

                <button
                  type="button"
                  onClick={() => void submitAnswer(transcript)}
                  disabled={!recordingSupported || sending || done || !transcript.trim()}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-foreground/15 bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send transcript"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
