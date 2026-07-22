import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useClerk, useSignUp } from "@clerk/react";
import type { SignUpFutureResource } from "@clerk/shared/types";
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
import {
  registerUser,
  setActiveSession,
  setStoredRole,
  setStoredUser,
  notifyAuthChange,
} from "@/contexts/auth-context";
import { AuthLeftPanel, MobileLogo, PasswordInput } from "@/routes/login";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — ElectraFlow AI" }] }),
  component: SignupPage,
});

const IS_CLERK_CONFIGURED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** True when Clerk reports the email is already registered (not localStorage). */
function isClerkEmailTakenError(error: {
  code?: string;
  message?: string;
  errors?: Array<{ code?: string; meta?: { paramName?: string } }>;
}): boolean {
  if (error.code === "form_identifier_exists") return true;
  if (
    error.errors?.some(
      (e) =>
        e.code === "form_identifier_exists" ||
        e.meta?.paramName === "email_address" ||
        e.meta?.paramName === "emailAddress",
    )
  ) {
    return true;
  }
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("already exists") || msg.includes("already been taken");
}

function setEmailTakenError(
  setErrors: Dispatch<SetStateAction<FormErrors>>,
  setTouched: Dispatch<SetStateAction<Partial<Record<keyof SignupForm, boolean>>>>,
) {
  setErrors((prev) => ({
    ...prev,
    email: "An account with this email already exists. Sign in instead.",
  }));
  setTouched((prev) => ({ ...prev, email: true }));
}

function logSignUpState(label: string, signUp: SignUpFutureResource | null | undefined): void {
  if (!import.meta.env.DEV || !signUp) return;
  console.info(`[ElectraFlow Signup] ${label}`, {
    status: signUp.status,
    missingFields: signUp.missingFields,
    unverifiedFields: signUp.unverifiedFields,
  });
}

async function sendSignupEmailCode(
  signUp: SignUpFutureResource,
): Promise<{ error: string | null }> {
  // Clerk v6: verifications.sendEmailCode() (equivalent to prepareEmailAddressVerification email_code)
  const { error } = await signUp.verifications.sendEmailCode();
  if (error) return { error: clerkErrorMessage(error) };
  return { error: null };
}

function clerkErrorMessage(error: { longMessage?: string; message?: string }): string {
  return error.longMessage || error.message || "Something went wrong. Please try again.";
}

type SignupStep = "details" | "verify";

interface PendingSignup {
  fullName: string;
  email: string;
  company: string;
  role: AppRole;
}

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

      {/* Job Role — fixed at signup, cannot be changed from the login form */}
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
          Your role is fixed after signup and controls your page access.
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
    if (field === "email") {
      setErrors((prev) => {
        if (!prev.email) return prev;
        const { email: _removed, ...rest } = prev;
        return rest;
      });
    } else if (touched[field]) {
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

  return {
    form,
    errors,
    setErrors,
    touched,
    setTouched,
    onChange,
    onBlur,
    touchAll,
    loading,
    setLoading,
  };
}

// ─── Clerk email verification step ────────────────────────────────────────────

interface EmailVerificationStepProps {
  email: string;
  code: string;
  verificationError: string | null;
  loading: boolean;
  onCodeChange: (value: string) => void;
  onVerify: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
}

function EmailVerificationStep({
  email,
  code,
  verificationError,
  loading,
  onCodeChange,
  onVerify,
  onResend,
  onBack,
}: EmailVerificationStepProps) {
  return (
    <>
      <MobileLogo />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the verification code sent to your email.
        </p>
        <p className="text-sm font-medium text-foreground mt-2">{email}</p>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Delivery can take a minute. Check your spam folder if you do not see the message.
        </p>
      </div>

      <form onSubmit={onVerify} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="su-verify-code">Verification code</Label>
          <Input
            id="su-verify-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\s/g, ""))}
            placeholder="123456"
            maxLength={8}
            aria-invalid={!!verificationError}
          />
          {verificationError && <FieldError msg={verificationError} />}
        </div>

        <Button type="submit" className="w-full h-10" disabled={loading || !code.trim()}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {loading ? "Verifying…" : "Verify"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full h-10"
          disabled={loading}
          onClick={onResend}
        >
          Resend code
        </Button>

        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Use a different email
        </button>
      </form>

      <p className="text-sm text-center text-muted-foreground mt-4">
        Already have an account?{" "}
        <Link to="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

// ─── Clerk signup session helpers ─────────────────────────────────────────────

const PENDING_SIGNUP_COMPANY_KEY = "mep-pending-company";
const PENDING_SIGNUP_ROLE_KEY = "mep-pending-role";

function persistPendingSignup(profile: PendingSignup): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING_SIGNUP_COMPANY_KEY, profile.company);
  sessionStorage.setItem(PENDING_SIGNUP_ROLE_KEY, profile.role);
}

// ─── Clerk signup form ────────────────────────────────────────────────────────

function ClerkSignupForm() {
  const navigate = useNavigate();
  const { signUp } = useSignUp();
  const { setActive } = useClerk();
  const [step, setStep] = useState<SignupStep>("details");
  const [pendingSignup, setPendingSignup] = useState<PendingSignup | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const {
    form,
    errors,
    setErrors,
    touched,
    setTouched,
    onChange,
    onBlur,
    touchAll,
    loading,
    setLoading,
  } = useSignupForm();

  useEffect(() => {
    setErrors({});
    setTouched({});
  }, [setErrors, setTouched]);

  async function finishVerifiedSignup(profile: PendingSignup, sessionId: string | null) {
    if (!sessionId) {
      const { error: finalizeError } = await signUp!.finalize();
      if (finalizeError) {
        toast.error(clerkErrorMessage(finalizeError));
        return;
      }
      sessionId = signUp!.createdSessionId;
    }

    if (!sessionId) {
      toast.error("Session could not be created after verification.");
      return;
    }

    // Write signup context BEFORE setActive so bootstrapProfile can read company/role
    // when ClerkAuthProvider reacts to the new session.
    setStoredUser({
      fullName: profile.fullName,
      email: profile.email,
      company: profile.company,
    });
    setStoredRole(profile.role);
    persistPendingSignup(profile);
    notifyAuthChange();

    await setActive({ session: sessionId });

    toast.success("Account verified! Let's set up your workspace.");
    navigate({ to: "/onboarding", replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    touchAll();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    if (!signUp) return;

    setLoading(true);
    setVerificationError(null);
    try {
      const nameParts = form.fullName.trim().split(" ");
      const pending: PendingSignup = {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        company: form.company.trim(),
        role: form.role,
      };

      const { error: createError } = await signUp.create({
        emailAddress: pending.email,
        password: form.password,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(" ") || "",
      });

      logSignUpState("after create", signUp);

      if (createError) {
        if (isClerkEmailTakenError(createError)) {
          setEmailTakenError(setErrors, setTouched);
        } else {
          toast.error(clerkErrorMessage(createError));
        }
        return;
      }

      if (signUp.status === "complete") {
        if (import.meta.env.DEV) {
          console.info("[ElectraFlow Signup] create complete — activating session", {
            createdSessionId: signUp.createdSessionId,
          });
        }
        await finishVerifiedSignup(pending, signUp.createdSessionId);
        return;
      }

      const { error: sendCodeError } = await sendSignupEmailCode(signUp);
      if (sendCodeError) {
        toast.error(sendCodeError);
        return;
      }

      if (import.meta.env.DEV) {
        console.info("[ElectraFlow Signup] sendEmailCode success (email_code strategy)");
        logSignUpState("after send verification code", signUp);
      }

      setPendingSignup(pending);
      persistPendingSignup(pending);
      setVerificationCode("");
      setVerificationError(null);
      setStep("verify");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!signUp || !pendingSignup) return;

    const code = verificationCode.trim();
    if (!code) {
      setVerificationError("Enter the verification code from your email.");
      return;
    }

    setLoading(true);
    setVerificationError(null);
    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });

      if (import.meta.env.DEV) {
        console.info("[ElectraFlow Signup] verifyEmailCode result", {
          verifyError: verifyError?.message ?? null,
          status: signUp.status,
          createdSessionId: signUp.createdSessionId,
          missingFields: signUp.missingFields,
          unverifiedFields: signUp.unverifiedFields,
        });
      }

      if (verifyError) {
        setVerificationError(clerkErrorMessage(verifyError));
        return;
      }

      if (signUp.status === "complete") {
        await finishVerifiedSignup(pendingSignup, signUp.createdSessionId);
        return;
      }

      logSignUpState("verification incomplete", signUp);
      setVerificationError(
        "Verification incomplete. Check the code and try again, or request a new code.",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification failed. Please try again.";
      setVerificationError(msg);
      if (import.meta.env.DEV) {
        console.info("[ElectraFlow Signup] attemptEmailAddressVerification error", err);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (!signUp) return;
    setLoading(true);
    setVerificationError(null);
    try {
      const { error: sendCodeError } = await sendSignupEmailCode(signUp);
      if (sendCodeError) {
        toast.error(sendCodeError);
        return;
      }
      if (import.meta.env.DEV) {
        console.info("[ElectraFlow Signup] verification code resent");
      }
      toast.success("A new verification code was sent to your email.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setLoading(false);
    }
  }

  function backToDetails() {
    void signUp?.reset();
    setStep("details");
    setPendingSignup(null);
    setVerificationCode("");
    setVerificationError(null);
  }

  if (step === "verify" && pendingSignup) {
    return (
      <SignupLayout>
        <EmailVerificationStep
          email={pendingSignup.email}
          code={verificationCode}
          verificationError={verificationError}
          loading={loading}
          onCodeChange={setVerificationCode}
          onVerify={verifyCode}
          onResend={resendCode}
          onBack={backToDetails}
        />
      </SignupLayout>
    );
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

// ─── Mock signup form ─────────────────────────────────────────────────────────

function MockSignupForm() {
  const navigate = useNavigate();
  const {
    form,
    errors,
    setErrors,
    touched,
    setTouched,
    onChange,
    onBlur,
    touchAll,
    loading,
    setLoading,
  } = useSignupForm();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    touchAll();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    setTimeout(() => {
      try {
        const newUser = registerUser({
          name: form.fullName,
          email: form.email,
          company: form.company,
          role: form.role,
          password: form.password,
        });
        setActiveSession(newUser);
        toast.success("Account created! Let's set up your workspace.");
        navigate({ to: "/onboarding", replace: true });
      } catch (err: unknown) {
        if (err instanceof Error && err.message === "EMAIL_TAKEN") {
          setEmailTakenError(setErrors, setTouched);
        } else {
          toast.error("Signup failed. Please try again.");
        }
      } finally {
        setLoading(false);
      }
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
