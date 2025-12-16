"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name?: string | null;
};

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Supabase is not configured.");
      return null;
    }
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setProfile(null);

    if (!supabase) return;

    setSubmitting(true);
    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (signInError) throw signInError;
      if (!data.user) throw new Error("No user returned from Supabase Auth.");

      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("id,email,full_name")
        .eq("id", data.user.id)
        .maybeSingle();

      if (userError) throw userError;

      if (userRow) {
        setProfile(userRow as ProfileRow);
      } else {
        setProfile({ id: data.user.id, email: data.user.email ?? null });
      }

      router.push("/interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-3xl border border-foreground/10 bg-background/70 p-6 backdrop-blur">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3 text-sm outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-foreground/20"
            placeholder="you@pup.edu.ph"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-xl border border-foreground/15 bg-background px-3 text-sm outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-foreground/20"
            placeholder="••••••••"
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !supabase}
          className="h-11 w-full rounded-xl border border-foreground/10 bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>

        {profile ? (
          <p className="text-xs text-foreground/60">
            Signed in as {profile.email ?? "(no email)"}.
          </p>
        ) : null}
      </form>
    </div>
  );
}
