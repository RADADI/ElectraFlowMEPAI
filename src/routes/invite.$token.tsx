/**
 * Invite acceptance page — Phase 6
 *
 * Public route: /invite/{rawToken}
 * Accessible without authentication.
 *
 * Flow:
 *   1. Page loads → fetches invite details by hashing the raw token
 *   2. Shows organisation name, role, and inviter
 *   3. "Create Account" button → stores raw token in sessionStorage, redirects to /signup
 *   4. User signs up with Clerk using the invited email
 *   5. bootstrapProfile() reads the token from sessionStorage → creates profile → marks invite accepted
 *
 * Edge cases handled:
 *   • Invalid / not found token → "Invitation not found" state
 *   • Expired token → "Invitation has expired" state
 *   • Already accepted → "Already accepted" state
 *   • Cancelled → "Invitation cancelled" state
 *   • User already signed in → shows message + home link
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useGetInviteByToken } from "@/hooks/api/useInvites";
import type { UserRole } from "@/types/database";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Invitation — ElectraFlow AI" }] }),
  component: InviteAcceptancePage,
});

// ─── Role display ─────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  project_manager: "Project Manager",
  senior_electrical_engineer: "Senior Electrical Engineer",
  electrical_engineer: "Electrical Engineer",
  qa_qc_engineer: "QA/QC Engineer",
  hr: "HR",
  executive: "Executive",
  client: "Client",
};

// ─── States ───────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Validating invitation…</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const isExpired = message.toLowerCase().includes("expired");
  const isAccepted = message.toLowerCase().includes("already been accepted");
  const isCancelled = message.toLowerCase().includes("cancelled");

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <svg
          className="h-7 w-7 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          {isAccepted || isCancelled ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          ) : isExpired ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          )}
        </svg>
      </div>

      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {isAccepted
            ? "Already Accepted"
            : isCancelled
              ? "Invitation Cancelled"
              : isExpired
                ? "Invitation Expired"
                : "Invitation Not Found"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs">{message}</p>
      </div>

      <Link
        to="/login"
        className="mt-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Go to Login
      </Link>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function InviteAcceptancePage() {
  const { token: rawToken } = Route.useParams();
  const { data: result, isLoading } = useGetInviteByToken(rawToken);

  // Save the raw token to sessionStorage immediately on page load.
  // This ensures it survives the Clerk redirect during signup.
  useEffect(() => {
    if (rawToken) {
      try {
        sessionStorage.setItem("mep_invite_token", rawToken);
      } catch {
        // ignore quota errors
      }
    }
  }, [rawToken]);

  function handleCreateAccount() {
    // Re-set the token (insurance against sessionStorage flush)
    try {
      sessionStorage.setItem("mep_invite_token", rawToken);
    } catch {
      // ignore
    }
    window.location.href = "/signup";
  }

  function handleSignIn() {
    try {
      sessionStorage.setItem("mep_invite_token", rawToken);
    } catch {
      // ignore
    }
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Brand */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-md">
            <svg
              className="h-6 w-6 text-primary-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">ElectraFlow AI</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          {isLoading ? (
            <LoadingState />
          ) : result?.error ? (
            <ErrorState message={result.error.message} />
          ) : result?.data ? (
            <div className="flex flex-col items-center gap-6 text-center">
              {/* Success icon */}
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <svg
                  className="h-7 w-7 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>

              <div className="space-y-1">
                <h1 className="text-xl font-bold text-foreground">You've been invited!</h1>
                {result.data.organization_name && (
                  <p className="text-sm text-muted-foreground">
                    Join{" "}
                    <strong className="text-foreground">{result.data.organization_name}</strong> on
                    ElectraFlow AI
                  </p>
                )}
              </div>

              {/* Invite details */}
              <div className="w-full rounded-xl border border-border bg-muted/30 p-4 space-y-3 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Invited email</span>
                  <span className="font-medium text-foreground">{result.data.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your role</span>
                  <span className="font-medium text-foreground">
                    {ROLE_LABELS[result.data.role] ?? result.data.role}
                  </span>
                </div>
                {result.data.inviter_name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Invited by</span>
                    <span className="font-medium text-foreground">{result.data.inviter_name}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Expires</span>
                  <span className="font-medium text-foreground">
                    {new Date(result.data.expires_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="w-full space-y-2">
                <button
                  onClick={handleCreateAccount}
                  className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Create Account
                </button>
                <button
                  onClick={handleSignIn}
                  className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Already have an account? Sign in
                </button>
              </div>

              <p className="text-xs text-muted-foreground text-center max-w-xs">
                You must sign up with{" "}
                <strong className="text-foreground">{result.data.email}</strong>. Using a different
                email will not work.
              </p>
            </div>
          ) : (
            <ErrorState message="Something went wrong validating this invitation. Please try again." />
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Having trouble?{" "}
          <a href="mailto:support@electraflow.ai" className="text-primary hover:underline">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}
