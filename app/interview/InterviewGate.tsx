"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Container from "../components/ui/Container";
import Modal from "../components/ui/Modal";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function InterviewGate() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [open, setOpen] = useState(false);

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
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setCheckingSession(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Container className="flex min-h-screen items-center justify-center py-16">
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Are you ready?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-foreground/75 sm:text-lg">
            Pixie will guide you through an interview-style session.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={checkingSession}
              onClick={() => setOpen(true)}
              className="inline-flex items-center justify-center rounded-full border border-foreground/10 bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex items-center justify-center rounded-full border border-foreground/15 bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              Not yet
            </button>
          </div>

          {checkingSession ? (
            <p className="mt-6 text-xs text-foreground/60">Checking session…</p>
          ) : null}
        </div>
      </Container>

      <Modal
        open={open}
        title="Terms and Conditions"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-4 text-sm text-foreground/80">
          <p>
            By continuing, you agree to the following terms for using Pixie (the
            AI interviewer).
          </p>

          <div className="space-y-2">
            <p className="font-medium text-foreground">1) Intended use</p>
            <p>
              Pixie is for interview practice and learning. It may produce
              mistakes and should not be treated as official or final guidance.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">2) Responsible input</p>
            <p>
              Do not share sensitive information (passwords, one-time codes,
              government IDs, private keys, or confidential data) during
              sessions.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">3) Conduct</p>
            <p>
              You agree to use Pixie respectfully and avoid abusive, hateful, or
              harmful content.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">4) Data & privacy</p>
            <p>
              Your use may be logged to improve the experience and for
              operational needs. Follow your organization’s policies when
              sharing information.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">5) Availability</p>
            <p>
              Pixie is provided “as is” and may be updated, limited, or
              unavailable at times.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-full border border-foreground/15 bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/interview/preview");
              }}
              className="inline-flex items-center justify-center rounded-full border border-foreground/10 bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              I agree
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
