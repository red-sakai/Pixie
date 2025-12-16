import Link from "next/link";

import Container from "../components/ui/Container";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Login — Pixie",
  description: "Log in to start your Pixie interview session.",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Container className="flex min-h-screen items-center justify-center py-16">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <p className="text-xs text-foreground/60">Pixie</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-foreground/70">
              Log in to start your interview.
            </p>
          </div>

          <LoginForm />

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-foreground/70 hover:underline">
              Back to home
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
