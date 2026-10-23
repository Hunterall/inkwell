import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Inkwell" },
      { name: "description", content: "Sign in to your Inkwell writing desk." },
      { property: "og:title", content: "Sign in — Inkwell" },
      { property: "og:description", content: "Sign in to your Inkwell writing desk." },
    ],
  }),
  component: AuthPage,
});

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) navigate({ to: "/stories", replace: true });
    });
    return unsub;
  }, [navigate]);

  async function handleGoogleSignIn() {
    setGoogleBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        toast.success(`Welcome, ${result.user.displayName || result.user.email || "writer"}!`);
        navigate({ to: "/stories", replace: true });
      }
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        return;
      }
      if (err.code === "auth/operation-not-allowed") {
        toast.error(
          "Google sign-in is not enabled in Firebase Console. Go to Firebase Console > Authentication > Sign-in method > Enable Google.",
          { duration: 6000 },
        );
        return;
      }
      if (err.code === "auth/unauthorized-domain") {
        toast.error(
          "Domain unauthorized in Firebase. Add localhost to Firebase Console > Authentication > Settings > Authorized domains.",
          { duration: 6000 },
        );
        return;
      }
      toast.error(err.message || "Failed to sign in with Google.");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isWorking = busy || googleBusy;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="page w-full max-w-sm rounded-lg p-8 shadow-md border border-border/80">
        <Link to="/" className="font-display text-2xl font-extrabold tracking-tight">
          Inkwell
        </Link>
        <h1 className="mt-6 text-3xl font-bold">
          {mode === "in" ? "Welcome back" : "Open a new notebook"}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "in"
            ? "Sign in to access your story bibles, scripts, and storyboard frames."
            : "Create your writer profile to start crafting your next project."}
        </p>

        {/* Google Sign-in Option */}
        <div className="mt-6">
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center justify-center gap-2.5 h-11 border-border/80 bg-background/60 hover:bg-background hover:border-sepia/50 transition-all font-medium text-sm shadow-sm"
            disabled={isWorking}
            onClick={handleGoogleSignIn}
          >
            <GoogleIcon className="h-4 w-4 shrink-0" />
            <span>{googleBusy ? "Connecting Google…" : "Continue with Google"}</span>
          </Button>

          <div className="relative my-5 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2.5 text-muted-foreground font-mono text-[10px] tracking-wider">
                or with email
              </span>
            </div>
          </div>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="writer@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isWorking}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              placeholder="••••••••"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isWorking}
            />
          </div>
          <Button type="submit" className="w-full h-10 font-semibold" disabled={isWorking}>
            {busy
              ? mode === "in"
                ? "Signing in…"
                : "Creating account…"
              : mode === "in"
                ? "Sign in with Email"
                : "Create account"}
          </Button>
        </form>

        <button
          className="mt-6 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          disabled={isWorking}
        >
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
