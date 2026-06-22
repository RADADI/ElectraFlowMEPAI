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
import { Zap, Loader2, Eye, EyeOff } from "lucide-react";
import { ROLES } from "@/lib/dummy-data";
import type { AppRole } from "@/lib/permissions";
import { getDefaultRoute } from "@/lib/permissions";
import { setStoredRole } from "@/contexts/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — ElectraFlow AI" }] }),
  beforeLoad: () => {
    // If already signed in, skip login and go directly to their landing page
    if (typeof window !== "undefined") {
      const role = localStorage.getItem("mep-role") as AppRole | null;
      if (role) {
        throw redirect({ to: getDefaultRoute(role) });
      }
    }
  },
  component: LoginPage,
});

const IS_CLERK_CONFIGURED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// ─── Shared left panel ────────────────────────────────────────────────────────

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

// ─── Mobile logo ──────────────────────────────────────────────────────────────

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

// ─── Password input with show/hide ────────────────────────────────────────────

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

// ─── Clerk-aware form ─────────────────────────────────────────────────────────

function ClerkLoginForm() {
  const navigate = useNavigate();
  const { signIn } = useSignIn();
  const [role, setRole] = useState<AppRole>("Admin");
  const [email, setEmail] = useState("demo@electraflow.ai");
  const [pwd, setPwd] = useState("demo1234");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setLoading(true);
    try {
      const { error: createError } = await signIn.create({ identifier: email, password: pwd });
      if (createError) {
        toast.error(createError.longMessage || createError.message || "Sign-in failed.");
        return;
      }
      if (signIn.status === "complete") {
        const { error: finalizeError } = await signIn.finalize();
        if (finalizeError) {
          toast.error(
            finalizeError.longMessage || finalizeError.message || "Session could not be created.",
          );
          return;
        }
        setStoredRole(role);
        toast.success(`Welcome back!`);
        navigate({ to: getDefaultRoute(role), replace: true });
      } else {
        toast.error("Sign-in incomplete. Additional verification may be required.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginLayout>
      <form onSubmit={submit} className="w-full max-w-md space-y-5">
        <LoginFormContent
          email={email}
          setEmail={setEmail}
          pwd={pwd}
          setPwd={setPwd}
          role={role}
          setRole={setRole}
          loading={loading}
        />
      </form>
    </LoginLayout>
  );
}

// ─── Mock-only form ───────────────────────────────────────────────────────────

function MockLoginForm() {
  const navigate = useNavigate();
  const [role, setRole] = useState<AppRole>("Admin");
  const [email, setEmail] = useState("demo@electraflow.ai");
  const [pwd, setPwd] = useState("demo1234");
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Simulate brief loading for UX feedback
    setTimeout(() => {
      setStoredRole(role);
      toast.success(`Welcome back!`);
      navigate({ to: getDefaultRoute(role), replace: true });
      setLoading(false);
    }, 400);
  }

  return (
    <LoginLayout>
      <form onSubmit={submit} className="w-full max-w-md space-y-5">
        <LoginFormContent
          email={email}
          setEmail={setEmail}
          pwd={pwd}
          setPwd={setPwd}
          role={role}
          setRole={setRole}
          loading={loading}
        />
      </form>
    </LoginLayout>
  );
}

// ─── Shared layout & form content ─────────────────────────────────────────────

function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      <AuthLeftPanel />
      <div className="flex items-center justify-center p-6 lg:p-12">{children}</div>
    </div>
  );
}

interface LoginFormContentProps {
  email: string;
  setEmail: (v: string) => void;
  pwd: string;
  setPwd: (v: string) => void;
  role: AppRole;
  setRole: (v: AppRole) => void;
  loading: boolean;
}

function LoginFormContent({
  email,
  setEmail,
  pwd,
  setPwd,
  role,
  setRole,
  loading,
}: LoginFormContentProps) {
  return (
    <>
      <MobileLogo />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back. Enter your credentials to continue.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-email">Work email</Label>
        <Input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
            onClick={() => toast.info("Password reset link sent (demo)")}
            className="text-xs text-primary hover:underline"
          >
            Forgot password?
          </button>
        </div>
        <PasswordInput
          id="login-pwd"
          value={pwd}
          onChange={setPwd}
          autoComplete="current-password"
        />
      </div>

      {/* Demo role picker */}
      <div className="space-y-2">
        <Label>
          Demo role{" "}
          {IS_CLERK_CONFIGURED && (
            <span className="text-xs text-muted-foreground font-normal">
              (temporary — tied to your account in Phase 3)
            </span>
          )}
        </Label>
        <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
          <SelectTrigger>
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
        <p className="text-xs text-muted-foreground">Each role sees only its permitted pages.</p>
      </div>

      <Button type="submit" className="w-full h-10" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {loading ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-sm text-center text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link to="/signup" className="text-primary font-medium hover:underline">
          Create one
        </Link>
      </p>

      <div className="text-xs text-center text-muted-foreground">
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
    </>
  );
}

// ─── Route component ─────────────────────────────────────────────────────────

function LoginPage() {
  if (IS_CLERK_CONFIGURED) return <ClerkLoginForm />;
  return <MockLoginForm />;
}
