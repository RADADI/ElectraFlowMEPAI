import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSignUp } from "@clerk/react";
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
import { Loader2 } from "lucide-react";
import { ROLES } from "@/lib/dummy-data";
import type { AppRole } from "@/lib/permissions";
import { setMockSession } from "@/contexts/auth-context";
import { AuthLeftPanel, MobileLogo, PasswordInput } from "@/routes/login";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — ElectraFlow AI" }] }),
  beforeLoad: () => {
    // If already signed in, skip signup
    if (typeof window !== "undefined") {
      const role = localStorage.getItem("mep-role");
      if (role) throw redirect({ to: "/" });
    }
  },
  component: SignupPage,
});

const IS_CLERK_CONFIGURED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// ─── Validation ───────────────────────────────────────────────────────────────

interface SignupForm {
  fullName: string;
  email: string;
  company: string;
  role: AppRole;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  company?: string;
  password?: string;
  confirmPassword?: string;
}

function validate(form: SignupForm): FormErrors {
  const errors: FormErrors = {};

  if (!form.fullName.trim()) {
    errors.fullName = "Full name is required";
  } else if (form.fullName.trim().split(" ").length < 2) {
    errors.fullName = "Please enter your first and last name";
  }

  if (!form.email.trim()) {
    errors.email = "Work email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "Enter a valid email address";
  }

  if (!form.company.trim()) {
    errors.company = "Company name is required";
  }

  if (!form.password) {
    errors.password = "Password is required";
  } else if (form.password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }

  if (!form.confirmPassword) {
    errors.confirmPassword = "Please confirm your password";
  } else if (form.password !== form.confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  return errors;
}

// ─── Field error helper ───────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}

// ─── Shared form layout ───────────────────────────────────────────────────────

// AuthLeftPanel already renders its own grid column (hidden lg:flex …).
// Just pair it with the form column inside a 2-col grid.
function SignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      <AuthLeftPanel />
      <div className="flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-md py-8">{children}</div>
      </div>
    </div>
  );
}

// ─── Shared form fields ───────────────────────────────────────────────────────

interface FormFieldsProps {
  form: SignupForm;
  errors: FormErrors;
  touched: Partial<Record<keyof SignupForm, boolean>>;
  onChange: (field: keyof SignupForm, value: string) => void;
  onBlur: (field: keyof SignupForm) => void;
  loading: boolean;
}

function SignupFormFields({ form, errors, touched, onChange, onBlur, loading }: FormFieldsProps) {
  return (
    <>
      <MobileLogo />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Join your team on ElectraFlow AI. Takes about a minute.
        </p>
      </div>

      {/* Full Name */}
      <div className="space-y-1.5">
        <Label htmlFor="su-name">Full name</Label>
        <Input
          id="su-name"
          type="text"
          value={form.fullName}
          onChange={(e) => onChange("fullName", e.target.value)}
          onBlur={() => onBlur("fullName")}
          placeholder="Jane Smith"
          autoComplete="name"
          aria-invalid={!!(touched.fullName && errors.fullName)}
        />
        {touched.fullName && <FieldError msg={errors.fullName} />}
      </div>

      {/* Work Email */}
      <div className="space-y-1.5">
        <Label htmlFor="su-email">Work email</Label>
        <Input
          id="su-email"
          type="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          onBlur={() => onBlur("email")}
          placeholder="jane@company.com"
          autoComplete="email"
          aria-invalid={!!(touched.email && errors.email)}
        />
        {touched.email && <FieldError msg={errors.email} />}
      </div>

      {/* Company Name */}
      <div className="space-y-1.5">
        <Label htmlFor="su-company">Company name</Label>
        <Input
          id="su-company"
          type="text"
          value={form.company}
          onChange={(e) => onChange("company", e.target.value)}
          onBlur={() => onBlur("company")}
          placeholder="Acme Engineering Co."
          autoComplete="organization"
          aria-invalid={!!(touched.company && errors.company)}
        />
        {touched.company && <FieldError msg={errors.company} />}
      </div>

      {/* Job Role */}
      <div className="space-y-1.5">
        <Label>Job role</Label>
        <Select value={form.role} onValueChange={(v) => onChange("role", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select your role" />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Your role determines which pages you can access.
        </p>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <Label htmlFor="su-pwd">Password</Label>
        <PasswordInput
          id="su-pwd"
          value={form.password}
          onChange={(v) => onChange("password", v)}
          placeholder="Min. 8 characters"
          autoComplete="new-password"
        />
        {touched.password && <FieldError msg={errors.password} />}
      </div>

      {/* Confirm Password */}
      <div className="space-y-1.5">
        <Label htmlFor="su-confirm">Confirm password</Label>
        <PasswordInput
          id="su-confirm"
          value={form.confirmPassword}
          onChange={(v) => onChange("confirmPassword", v)}
          placeholder="Repeat password"
          autoComplete="new-password"
        />
        {touched.confirmPassword && <FieldError msg={errors.confirmPassword} />}
      </div>

      <Button type="submit" className="w-full h-10 mt-2" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {loading ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-sm text-center text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>

      <div className="text-xs text-center text-muted-foreground">
        By creating an account you agree to the{" "}
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

// ─── Shared form state hook ───────────────────────────────────────────────────

function useSignupForm() {
  const [form, setForm] = useState<SignupForm>({
    fullName: "",
    email: "",
    company: "",
    role: "Electrical Engineer",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof SignupForm, boolean>>>({});
  const [loading, setLoading] = useState(false);

  function onChange(field: keyof SignupForm, value: string) {
    const next = { ...form, [field]: value };
    setForm(next);
    // Re-validate on every change once a field has been touched
    if (touched[field]) {
      setErrors(validate(next));
    }
  }

  function onBlur(field: keyof SignupForm) {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors(validate(form));
  }

  function touchAll() {
    const all = Object.keys(form) as (keyof SignupForm)[];
    setTouched(Object.fromEntries(all.map((k) => [k, true])));
  }

  return { form, errors, touched, onChange, onBlur, touchAll, loading, setLoading };
}

// ─── Clerk-aware signup form ──────────────────────────────────────────────────

function ClerkSignupForm() {
  const navigate = useNavigate();
  const { signUp } = useSignUp();
  const { form, errors, touched, onChange, onBlur, touchAll, loading, setLoading } =
    useSignupForm();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    touchAll();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) return;
    if (!signUp) return;

    setLoading(true);
    try {
      const nameParts = form.fullName.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || "";

      const { error: createError } = await signUp.create({
        emailAddress: form.email,
        password: form.password,
        firstName,
        lastName,
      });

      if (createError) {
        toast.error(createError.longMessage || createError.message || "Signup failed.");
        return;
      }

      if (signUp.status === "complete") {
        const { error: finalizeError } = await signUp.finalize();
        if (finalizeError) {
          toast.error(
            finalizeError.longMessage || finalizeError.message || "Account could not be created.",
          );
          return;
        }
      } else if (signUp.status === "missing_requirements") {
        // Email verification required — inform user and fall through to mock storage
        toast.info("Account created! Check your email to verify, then sign in.");
      }

      // Atomically write profile + role so the topbar shows immediately.
      setMockSession(
        { fullName: form.fullName, email: form.email, company: form.company },
        form.role,
      );
      toast.success("Account created! Let's set up your workspace.");
      navigate({ to: "/onboarding", replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SignupLayout>
      <form onSubmit={submit} className="space-y-4">
        <SignupFormFields
          form={form}
          errors={errors}
          touched={touched}
          onChange={onChange}
          onBlur={onBlur}
          loading={loading}
        />
      </form>
    </SignupLayout>
  );
}

// ─── Mock-only signup form ────────────────────────────────────────────────────

function MockSignupForm() {
  const navigate = useNavigate();
  const { form, errors, touched, onChange, onBlur, touchAll, loading, setLoading } =
    useSignupForm();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    touchAll();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    // Simulate brief network delay
    setTimeout(() => {
      setMockSession(
        { fullName: form.fullName, email: form.email, company: form.company },
        form.role,
      );
      toast.success("Account created! Let's set up your workspace.");
      navigate({ to: "/onboarding", replace: true });
      setLoading(false);
    }, 500);
  }

  return (
    <SignupLayout>
      <form onSubmit={submit} className="space-y-4">
        <SignupFormFields
          form={form}
          errors={errors}
          touched={touched}
          onChange={onChange}
          onBlur={onBlur}
          loading={loading}
        />
      </form>
    </SignupLayout>
  );
}

// ─── Route component ──────────────────────────────────────────────────────────

function SignupPage() {
  if (IS_CLERK_CONFIGURED) return <ClerkSignupForm />;
  return <MockSignupForm />;
}
