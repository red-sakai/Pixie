"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Container from "@/app/components/ui/Container";
import { getSupabaseClient } from "@/lib/supabaseClient";

type CheckState = "idle" | "running" | "pass" | "fail";

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function formatError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

export default function InterviewPreview() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [permissionState, setPermissionState] = useState<CheckState>("idle");
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const [audioState, setAudioState] = useState<CheckState>("idle");
  const [micState, setMicState] = useState<CheckState>("idle");

  const [micLevel, setMicLevel] = useState(0);
  const [micDetected, setMicDetected] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

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

  const stopMedia = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setMicLevel(0);
  }, []);

  useEffect(() => {
    return () => stopMedia();
  }, [stopMedia]);

  async function enableCameraAndMic() {
    setPermissionError(null);
    setPermissionState("running");

    setAudioState("idle");
    setMicState("idle");
    setMicDetected(false);

    try {
      stopMedia();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Your browser does not support camera/microphone access.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // Prefer a landscape feed for the preview (e.g., 16:9).
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16 / 9 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      startMicMonitor(stream);
      setPermissionState("pass");
    } catch (e) {
      setPermissionState("fail");
      setPermissionError(formatError(e));
    }
  }

  function startMicMonitor(stream: MediaStream) {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setMicState("fail");
      return;
    }

    const AudioContextImpl =
      window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    const ctx = new AudioContextImpl();
    audioContextRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(analyser);
    analyserRef.current = analyser;

    const buffer = new Uint8Array(analyser.fftSize);
    let consecutiveAbove = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(buffer);

      // Compute normalized RMS of time-domain samples.
      let sumSq = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buffer.length);
      setMicLevel(rms);

      // Heuristic threshold for "speaking".
      const above = rms > 0.035;
      if (above) consecutiveAbove += 1;
      else consecutiveAbove = Math.max(0, consecutiveAbove - 1);

      if (!micDetected) {
        setMicState("running");
      }

      if (!micDetected && consecutiveAbove >= 8) {
        setMicDetected(true);
        setMicState("pass");
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  async function playTestAudio() {
    if (audioState === "running") return;

    setAudioState("running");

    try {
      const AudioContextImpl =
        window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
      const ctx: AudioContext = audioContextRef.current ?? new AudioContextImpl();
      audioContextRef.current = ctx;

      // Some browsers require a user gesture; this is triggered by a button.
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 440;

      // Gentle beep.
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + 0.6);

      oscillator.start(now);
      oscillator.stop(now + 0.65);

      await new Promise<void>((resolve) => {
        oscillator.onended = () => resolve();
      });

      setAudioState("pass");
    } catch (e) {
      setAudioState("fail");
      setPermissionError((prev) => prev ?? formatError(e));
    }
  }

  const permissionLabel =
    permissionState === "idle"
      ? "Not enabled"
      : permissionState === "running"
        ? "Requesting permissions…"
        : permissionState === "pass"
          ? "Enabled"
          : "Blocked";

  const audioLabel =
    audioState === "idle"
      ? "Not played"
      : audioState === "running"
        ? "Playing…"
        : audioState === "pass"
          ? "Played"
          : "Failed";

  const micLabel =
    micState === "idle"
      ? "Waiting"
      : micState === "running"
        ? "Listening… (speak now)"
        : micState === "pass"
          ? "Voice detected"
          : "No mic detected";

  const readyToContinue =
    permissionState === "pass" && audioState === "pass" && micState === "pass";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Container className="py-16">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Device preview
          </h1>
          <p className="mt-3 text-pretty text-sm text-foreground/75 sm:text-base">
            Open your camera, verify audio playback, and speak into your mic so
            Pixie can confirm your setup.
          </p>

          {checkingSession ? (
            <p className="mt-6 text-xs text-foreground/60">Checking session…</p>
          ) : null}
          {sessionError ? (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              {sessionError}
            </div>
          ) : null}

          <div className="mt-8 grid gap-6">
            <div className="rounded-3xl border border-foreground/10 bg-background/70 p-5 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Camera + Microphone</p>
                  <p className="mt-1 text-xs text-foreground/60">
                    Status: {permissionLabel}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={checkingSession || permissionState === "running"}
                    onClick={enableCameraAndMic}
                    className="inline-flex items-center justify-center rounded-full border border-foreground/10 bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                  >
                    Enable camera & mic
                  </button>
                  <button
                    type="button"
                    onClick={stopMedia}
                    className="inline-flex items-center justify-center rounded-full border border-foreground/15 bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                  >
                    Stop
                  </button>
                </div>
              </div>

              {permissionError ? (
                <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  {permissionError}
                </div>
              ) : null}

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-black/20">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="aspect-video w-full object-cover"
                  />
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-foreground/10 bg-background p-4">
                    <p className="text-sm font-medium">Audio playback test</p>
                    <p className="mt-1 text-xs text-foreground/60">
                      Status: {audioLabel}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={permissionState !== "pass"}
                        onClick={playTestAudio}
                        className="inline-flex items-center justify-center rounded-full border border-foreground/10 bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Play test audio
                      </button>
                      <p className="text-xs text-foreground/60">
                        If you don’t hear it, check volume/output device.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-foreground/10 bg-background p-4">
                    <p className="text-sm font-medium">Microphone test</p>
                    <p className="mt-1 text-xs text-foreground/60">
                      Status: {micLabel}
                    </p>

                    <div className="mt-3">
                      <div className="h-3 w-full overflow-hidden rounded-full border border-foreground/10 bg-foreground/5">
                        <div
                          className="h-full bg-foreground/60"
                          style={{ width: `${Math.min(100, micLevel * 2600)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-foreground/60">
                        Speak normally for a second to confirm detection.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push("/interview")}
                    className="inline-flex w-full items-center justify-center rounded-full border border-foreground/15 bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    disabled={!readyToContinue}
                    onClick={() => router.push("/interview/session")}
                    className="inline-flex w-full items-center justify-center rounded-full border border-foreground/10 bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                  >
                    Continue to interview
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
