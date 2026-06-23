import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSignIn } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Zap, Loader2, Eye, EyeOff, AlertCircle, FlaskConical } from "lucide-react";
import { ROLES } from "@/lib/dummy-data";
import type { AppRole } from "@/lib/permissions";
import { getDefaultRoute } from "@/lib/permissions";
import {
  setActiveSession,
  setMockSession,
  notifyAuthChange,
  setStoredRole,
  validateLogin,
  type StoredUser,
} from "@/contexts/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — ElectraFlow AI" }] }),
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const role = localStorage.getItem("mep-role") as AppRole | null;
      if (role) throw redirect({ to: getDefaultRoute(role) });
    }
  },
  component: LoginPage,
});

const IS_CLERK_CONFIGURED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// ─── Shared UI helpers ────────────────────────────────────────────────────────

export function AuthLeftPanel() {
  return (
    <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, oklch(0.6 0.2 255 / 0.5), transparent 40%), radial-gradient(circle at 80% 60%, oklch(0.55 0.2 200 / 0.4), transparent 50%)",
        }}
      />
      <div className="relative flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-sidebar-primary grid place-items-center">
          <Zap className="h-6 w-6 text-sidebar-primary-foreground" />
        </div>
        <div>
          <div className="font-semibold text-lg">ElectraFlow AI</div>
          <div className="text-xs text-sidebar-foreground/60 uppercase tracking-wider">
            Enterprise Electrical Intelligence Platform
          </div>
        </div>
      </div>
      <div className="relative space-y-4 max-w-md">
        <h2 className="text-3xl font-semibold leading-tight">
          The intelligent operating system for electrical engineering firms.
        </h2>
        <p className="text-sidebar-foreground/70">
          Single-line diagrams, load schedules, submittal reviews, AI compliance checks, and
          resource planning — unified in one workspace trusted by leading engineering teams.
        </p>
        <div className="flex gap-6 pt-4 text-sm">
          <div>
            <div className="text-2xl font-semibold">12k+</div>
            <div className="text-sidebar-foreground/60">Submittals reviewed</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">340+</div>
            <div className="text-sidebar-foreground/60">Active projects</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">99.9%</div>
            <div className="text-sidebar-foreground/60">Uptime SLA</div>
          </div>
        </div>
      </div>
      <div className="relative text-xs text-sidebar-foreground/50">
        © 2025 ElectraFlow AI · SOC 2 · ISO 27001
      </div>
    </div>
  );
}

export function MobileLogo() {
  return (
    <div className="lg:hidden flex items-center gap-2 mb-4">
      <div className="h-8 w-8 rounded-md bg-primary grid place-items-center">
        <Zap className="h-5 w-5 text-primary-foreground" />
      </div>
      <span className="font-semibold">ElectraFlow AI</span>
    </div>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/8 px-3 py-2.5 text-sm text-destructive flex items-start gap-2">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ─── Shared layout ────────────────────────────────────────────────────────────

function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      <AuthLeftPanel />
      <div className="flex items-start justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-md py-8 space-y-0">{children}</div>
      </div>
    </div>
  );
}

// ─── Demo login section ───────────────────────────────────────────────────────
// Shown below the real login form in BOTH mock and Clerk modes.
// Role selector lives ONLY here; the real login has no role picker.

function DemoLoginSection() {
  const navigate = useNavigate();
  const [demoRole, setDemoRole] = useState<AppRole>("Admin");
  const [loading, setLoading] = useState(false);

  function handleDemo() {
    setLoading(true);
    // Build a demo user from the role; never writes to mep-users registry.
    const slug = demoRole
      .toLowerCase()
      .replace(/[\s/]+/g, ".")
      .replace(/[^a-z.]/g, "");
    const demoUser: StoredUser = {
      fullName: `${demoRole} Demo`,
      email: `${slug}@electraflow.ai`,
      company: "ElectraFlow Demo",
      isDemo: true,
    };
    setTimeout(() => {
      setMockSession(demoUser, demoRole);
      toast.success(`Demo mode: signed in as ${demoRole}`);
      navigate({ to: getDefaultRoute(demoRole), replace: true });
      setLoading(false);
    }, 300);
  }

  return (
    <div className="mt-8 pt-6 border-t border-dashed">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Demo Login
        </span>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
          For role testing only
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        Instantly preview any role without creating an account. Demo users do not affect real
        accounts and are cleared on sign-out.
      </p>

      <div className="space-y-3">
        <Select value={demoRole} onValueChange={(v) => setDemoRole(v as AppRole)}>
          <SelectTrigger className="bg-muted/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          className="w-full h-9 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
          onClick={handleDemo}
          disabled={loading}
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
          {loading ? "Loading…" : `Continue as ${demoRole} Demo`}
        </Button>
      </div>
    </div>
  );
}

// ─── Mock real-login form ─────────────────────────────────────────────────────
// Email + password only. Validates against mep-users registry.

function MockLoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFormError("Please enter your email address.");
      return;
    }
    if (!pwd) {
      setFormError("Please enter your password.");
      return;
    }

    setLoading(true);
    // Simulate a brief network round-trip for realism.
    setTimeout(() => {
      const result = validateLogin(email.trim(), pwd);
      if (result === "NOT_FOUND") {
        setFormError("No account found with this email. Please create an account.");
        setLoading(false);
        return;
      }
      if (result === "WRONG_PASSWORD") {
        setFormError("Incorrect password. Please try again.");
        setLoading(false);
        return;
      }
      // result is a MockUser
      setActiveSession(result);
      toast.success(`Welcome back, ${result.name.split(" ")[0]}!`);
      navigate({ to: getDefaultRoute(result.role), replace: true });
      setLoading(false);
    }, 400);
  }

  return (
    <LoginLayout>
      <MobileLogo />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back. Enter your credentials to continue.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Work email</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFormError(null);
            }}
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-pwd">Password</Label>
            <button
              type="button"
              onClick={() => toast.info("Contact your administrator to reset your password.")}
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <PasswordInput
            id="login-pwd"
            value={pwd}
            onChange={(v) => {
              setPwd(v);
              setFormError(null);
            }}
            autoComplete="current-password"
          />
        </div>

        {formError && <FormError message={formError} />}

        <Button type="submit" className="w-full h-10" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-center text-muted-foreground mt-4">
        Don&apos;t have an account?{" "}
        <Link to="/signup" className="text-primary font-medium hover:underline">
          Create one
        </Link>
      </p>

      <DemoLoginSection />

      <div className="text-xs text-center text-muted-foreground mt-6">
        By signing in you agree to the{" "}
        <button type="button" className="hover:underline">
          Terms
        </button>{" "}
        and{" "}
        <button type="button" className="hover:underline">
          Privacy Policy
        </button>
        .
      </div>
    </LoginLayout>
  );
}

// ─── Clerk real-login form ────────────────────────────────────────────────────
// Uses Clerk for identity; role comes from what was stored at signup.

function ClerkLoginForm() {
  const navigate = useNavigate();
  const { signIn } = useSignIn();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!signIn) return;
    setLoading(true);
    try {
      const { error: createError } = await signIn.create({ identifier: email, password: pwd });
      if (createError) {
        setFormError(createError.longMessage || createError.message || "Sign-in failed.");
        return;
      }
      if (signIn.status === "complete") {
        const { error: finalizeError } = await signIn.finalize();
        if (finalizeError) {
          setFormError(
            finalizeError.longMessage || finalizeError.message || "Session could not be created.",
          );
          return;
        }
        // Role was stored at signup in mep-role; just notify providers.
        notifyAuthChange();
        const role = localStorage.getItem("mep-role") as AppRole | null;
        toast.success("Welcome back!");
        navigate({ to: getDefaultRoute(role), replace: true });
      } else {
        setFormError("Sign-in incomplete. Additional verification may be required.");
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginLayout>
      <MobileLogo />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back. Enter your credentials to continue.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="clerk-email">Work email</Label>
          <Input
            id="clerk-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFormError(null);
            }}
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="clerk-pwd">Password</Label>
            <button
              type="button"
              onClick={() => toast.info("Contact your administrator to reset your password.")}
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <PasswordInput
            id="clerk-pwd"
            value={pwd}
            onChange={(v) => {
              setPwd(v);
              setFormError(null);
            }}
            autoComplete="current-password"
          />
        </div>

        {formError && <FormError message={formError} />}

        <Button type="submit" className="w-full h-10" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-center text-muted-foreground mt-4">
        Don&apos;t have an account?{" "}
        <Link to="/signup" className="text-primary font-medium hover:underline">
          Create one
        </Link>
      </p>

      <DemoLoginSection />

      <div className="text-xs text-center text-muted-foreground mt-6">
        By signing in you agree to the{" "}
        <button type="button" className="hover:underline">
          Terms
        </button>{" "}
        and{" "}
        <button type="button" className="hover:underline">
          Privacy Policy
        </button>
        .
      </div>
    </LoginLayout>
  );
}

// ─── Route component ──────────────────────────────────────────────────────────

function LoginPage() {
  if (IS_CLERK_CONFIGURED) return <ClerkLoginForm />;
  return <MockLoginForm />;
}

// Keep exported for Clerk login, used by ClerkLoginForm
export { setStoredRole };
