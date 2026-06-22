import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useUser, useClerk, useSession } from "@clerk/react";
import type { AppRole } from "@/lib/permissions";
import { setClerkTokenGetter, setJwtReady } from "@/lib/supabase";
import { setCachedProfile, clearCachedProfile, bootstrapProfile } from "@/lib/auth-bridge";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A registered user account stored in mep-users (the mock "database").
 * Password is kept plaintext — acceptable for a no-backend demo; never sent
 * over the wire.
 */
export interface MockUser {
  id: string;
  name: string;
  email: string;
  company: string;
  role: AppRole;
  password: string;
  onboardingDone: boolean;
  createdAt: string;
}

/**
 * The active session object stored in mep-user.
 * Contains no password; id links back to MockUser for registry updates.
 * isDemo is true when the session was created via Demo Login (no registry entry).
 */
export interface StoredUser {
  fullName: string;
  email: string;
  company: string;
  id?: string; // present for real accounts, absent for demo sessions
  isDemo?: boolean;
}

/**
 * Profile bootstrap status — Phase 5.
 *
 * idle       — Clerk not yet loaded (initial render)
 * loading    — Fetching / creating the Supabase profile row
 * ok         — Profile found with org, JWT wired, real DB ops are available
 * no_org     — Profile exists but organization_id is null
 * not_found  — No profile and auto-create failed (no org metadata)
 * error      — Network / DB failure; show retry
 * mock       — Mock / demo auth mode (no Clerk JWT involved)
 */
export type ProfileStatus = "idle" | "loading" | "ok" | "no_org" | "not_found" | "error" | "mock";

export interface AuthState {
  isSignedIn: boolean;
  isLoaded: boolean;
  role: AppRole | null;
  displayName: string;
  email: string;
  company: string;
  imageUrl: string | null;
  initials: string;
  isDemo: boolean;
  /** True when Clerk JWT is wired and the DB profile is verified. */
  isJwtReady: boolean;
  /** Profile bootstrap status.  Components can show appropriate error UI. */
  profileStatus: ProfileStatus;
  signOut: () => void;
}

// ─── Storage key constants ────────────────────────────────────────────────────

const ROLE_KEY = "mep-role";
const USER_KEY = "mep-user";
const ONBOARDING_KEY = "mep-onboarding-done";
/** Persists across sign-outs — all registered mock accounts. */
const USERS_KEY = "mep-users";
/** Custom event name that auth helpers dispatch so providers refresh state immediately. */
const AUTH_CHANGE_EVENT = "mep-auth-change";

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// ─── Low-level session helpers ────────────────────────────────────────────────

export function getStoredRole(): AppRole | null {
  if (typeof window === "undefined") return null;
  return (localStorage.getItem(ROLE_KEY) as AppRole) || null;
}

export function setStoredRole(role: AppRole) {
  if (typeof window !== "undefined") localStorage.setItem(ROLE_KEY, role);
}

export function clearStoredRole() {
  if (typeof window !== "undefined") localStorage.removeItem(ROLE_KEY);
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser) {
  if (typeof window !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  if (typeof window !== "undefined") localStorage.removeItem(USER_KEY);
}

export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function setOnboardingDone() {
  if (typeof window !== "undefined") localStorage.setItem(ONBOARDING_KEY, "true");
}

export function clearOnboardingDone() {
  if (typeof window !== "undefined") localStorage.removeItem(ONBOARDING_KEY);
}

// ─── User registry helpers (mep-users) ───────────────────────────────────────

export function getRegisteredUsers(): MockUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as MockUser[]) : [];
  } catch {
    return [];
  }
}

function saveRegisteredUsers(users: MockUser[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
}

export function findUserByEmail(email: string): MockUser | undefined {
  const needle = email.trim().toLowerCase();
  return getRegisteredUsers().find((u) => u.email === needle);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Creates a new account in the mock registry.
 * Throws Error("EMAIL_TAKEN") if the email already exists.
 */
export function registerUser(data: {
  name: string;
  email: string;
  company: string;
  role: AppRole;
  password: string;
}): MockUser {
  const users = getRegisteredUsers();
  const needle = data.email.trim().toLowerCase();
  if (users.some((u) => u.email === needle)) {
    throw new Error("EMAIL_TAKEN");
  }
  const newUser: MockUser = {
    id: generateId(),
    name: data.name,
    email: needle,
    company: data.company,
    role: data.role,
    password: data.password,
    onboardingDone: false,
    createdAt: new Date().toISOString(),
  };
  saveRegisteredUsers([...users, newUser]);
  return newUser;
}

/**
 * Partially updates a user's registry entry (e.g. onboardingDone).
 */
export function updateRegisteredUser(id: string, updates: Partial<Omit<MockUser, "id">>): void {
  if (typeof window === "undefined") return;
  const users = getRegisteredUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...updates };
    saveRegisteredUsers(users);
  }
}

export type LoginResult = MockUser | "NOT_FOUND" | "WRONG_PASSWORD";

/**
 * Validates email + password against the mock registry.
 * Returns the MockUser on success, or an error code string.
 */
export function validateLogin(email: string, password: string): LoginResult {
  const user = findUserByEmail(email);
  if (!user) return "NOT_FOUND";
  if (user.password !== password) return "WRONG_PASSWORD";
  return user;
}

// ─── High-level session helpers ───────────────────────────────────────────────

// Key for the org-id cache written by auth-bridge.ts.
// Cleared here to prevent the next user from inheriting a stale org context.
const ORG_ID_CACHE_KEY = "mep-org-id";

/** Notify all auth providers to re-read localStorage immediately. */
export function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
  }
}

/**
 * Starts an authenticated session for a REGISTERED user.
 * Writes mep-user + mep-role; restores their onboarding status.
 * Does NOT write to mep-users (registry stays unchanged).
 */
export function setActiveSession(user: MockUser): void {
  setStoredUser({
    fullName: user.name,
    email: user.email,
    company: user.company,
    id: user.id,
    isDemo: false,
  });
  setStoredRole(user.role);
  // Restore onboarding status so returning users aren't sent through onboarding again.
  if (user.onboardingDone) {
    setOnboardingDone();
  } else {
    clearOnboardingDone();
  }
  notifyAuthChange();
}

/**
 * Starts a DEMO session (role-testing only).
 * Writes mep-user + mep-role; never touches the user registry.
 * Demo users do NOT overwrite registered accounts — they're isolated.
 */
export function setMockSession(user: StoredUser, role: AppRole): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, isDemo: true }));
  localStorage.setItem(ROLE_KEY, role);
  notifyAuthChange();
}

/**
 * Clears the ACTIVE SESSION only.
 * mep-users (the registry) is intentionally NOT removed — registered
 * accounts must survive across sign-outs.
 */
export function clearAuthStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ONBOARDING_KEY);
  // Clear the cached org ID so the next user does not inherit a stale
  // organisation context (auth-bridge.ts writes this key).
  localStorage.removeItem(ORG_ID_CACHE_KEY);
  notifyAuthChange();
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function toInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function readSession() {
  return { role: getStoredRole(), user: getStoredUser() };
}

// ─── Clerk profile loading / error screens ───────────────────────────────────

function ProfileLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Loading your workspace…</p>
      </div>
    </div>
  );
}

function AccountNotConfiguredScreen({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry?: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <svg
            className="h-6 w-6 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-lg font-semibold text-foreground">Account not configured</h1>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Retry
            </button>
          )}
          <button
            onClick={onSignOut}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Clerk provider ───────────────────────────────────────────────────────────

function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { user, isSignedIn, isLoaded } = useUser();
  const { session } = useSession();
  const { signOut: clerkSignOut } = useClerk();

  const [jwtReady, setJwtReadyState] = useState(false);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");
  const [bootstrapError, setBootstrapError] = useState<string>("");

  // Refresh on mock auth changes (e.g. demo login alongside Clerk)
  const [, setTick] = useState(0);
  useEffect(() => {
    function refresh() {
      setTick((t) => t + 1);
    }
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
  }, []);

  // ── Phase 5: Wire Clerk JWT → Supabase + bootstrap DB profile ─────────────
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !session || !user) {
      // Signed out — clear everything
      setClerkTokenGetter(null);
      setJwtReady(false);
      setJwtReadyState(false);
      clearCachedProfile();
      setProfileStatus("idle");
      setBootstrapError("");
      return;
    }

    // Wire the Clerk token getter so every Supabase request gets a fresh JWT.
    // session.getToken() handles Clerk-side caching and refresh transparently.
    setClerkTokenGetter(() => session.getToken({ template: "supabase" }));

    // Bootstrap profile: fetch from DB; auto-create if first login.
    setProfileStatus("loading");
    setBootstrapError("");

    const orgIdFromMetadata =
      (user.publicMetadata?.organization_id as string | undefined)?.trim() || null;

    bootstrapProfile({
      clerkUserId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? "",
      fullName: user.fullName ?? user.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "User",
      orgIdFromMetadata,
    })
      .then((result) => {
        if (result.ok && result.profile) {
          // Cache the DB-authoritative profile values
          setCachedProfile(result.profile);

          // Sync the DB role to localStorage so the existing RBAC engine
          // (which reads localStorage via getStoredRole()) uses the DB value.
          // This is the ONLY time we write role to localStorage from DB.
          setStoredRole(result.profile.role);
          notifyAuthChange();

          // Signal to the project service that real DB ops are now available
          setJwtReady(true);
          setJwtReadyState(true);
          setProfileStatus("ok");
        } else {
          setBootstrapError(result.error ?? "Unknown error");
          setProfileStatus(result.reason ?? "error");
          // Leave mep-role as the temporary placeholder — user sees error screen,
          // not the app, so there's no RBAC risk.
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setBootstrapError(msg);
        setProfileStatus("error");
      });

    return () => {
      // Clean up on unmount or when the session changes
      setClerkTokenGetter(null);
      setJwtReady(false);
      setJwtReadyState(false);
      clearCachedProfile();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, session?.id]);

  // ── Phase 5: Ensure mep-role is set while bootstrap is loading ────────────
  // The _app.tsx beforeLoad guard checks localStorage("mep-role").
  // Without this, Clerk-signed-in users would be redirected to /login
  // every time (because mep-role is cleared on sign-out).
  // Set a minimum-privilege placeholder; the bootstrap replaces it with the DB role.
  if (isLoaded && isSignedIn && typeof window !== "undefined" && !localStorage.getItem(ROLE_KEY)) {
    localStorage.setItem(ROLE_KEY, "electrical_engineer");
  }

  // ── Handle blocking states (shown instead of the app) ─────────────────────
  const doSignOut = () => {
    clearAuthStorage();
    clearCachedProfile();
    setJwtReady(false);
    setJwtReadyState(false);
    setClerkTokenGetter(null);
    clerkSignOut({ redirectUrl: "/login" });
  };

  if (isLoaded && isSignedIn && profileStatus === "loading") {
    return <ProfileLoadingScreen />;
  }

  if (isLoaded && isSignedIn && profileStatus === "no_org") {
    return (
      <AccountNotConfiguredScreen
        message="Your profile was found but is not assigned to an organisation. Ask your Admin to configure your account in the database."
        onSignOut={doSignOut}
      />
    );
  }

  if (isLoaded && isSignedIn && profileStatus === "not_found") {
    return (
      <AccountNotConfiguredScreen
        message={
          bootstrapError ||
          "No profile found for this account. Ask your Admin to invite you or add your profile to the database."
        }
        onSignOut={doSignOut}
      />
    );
  }

  if (isLoaded && isSignedIn && profileStatus === "error") {
    return (
      <AccountNotConfiguredScreen
        message={
          bootstrapError ||
          "Failed to load your account profile. Check your network connection and try again."
        }
        onRetry={() => {
          setProfileStatus("idle");
          setBootstrapError("");
          // Re-trigger the bootstrap effect
          setTick((t) => t + 1);
        }}
        onSignOut={doSignOut}
      />
    );
  }

  // ── Derive display values ─────────────────────────────────────────────────
  const storedUser = getStoredUser();
  const role = getStoredRole(); // DB role synced here on bootstrap success

  const displayName =
    user?.fullName ||
    storedUser?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "User";
  const email = user?.primaryEmailAddress?.emailAddress || storedUser?.email || "";
  const company = storedUser?.company || "";

  const value: AuthState = {
    isSignedIn: isLoaded && !!isSignedIn,
    isLoaded,
    role,
    displayName,
    email,
    company,
    imageUrl: user?.imageUrl || null,
    initials: toInitials(displayName) || "EF",
    isDemo: storedUser?.isDemo ?? false,
    isJwtReady: jwtReady,
    profileStatus,
    signOut: doSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Mock provider ────────────────────────────────────────────────────────────

function MockAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => readSession());

  useEffect(() => {
    function refresh() {
      setSession(readSession());
    }
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
  }, []);

  const { role, user: storedUser } = session;
  const isSignedIn = !!role;
  const displayName = storedUser?.fullName || (role ? `${role} Demo` : "Guest");
  const email = storedUser?.email || "";
  const company = storedUser?.company || "";
  const initials = toInitials(displayName) || role?.slice(0, 2).toUpperCase() || "EF";

  const value: AuthState = {
    isSignedIn,
    isLoaded: true,
    role,
    displayName,
    email,
    company,
    imageUrl: null,
    initials,
    isDemo: storedUser?.isDemo ?? false,
    // Mock mode never uses Clerk JWT or Supabase DB
    isJwtReady: false,
    profileStatus: "mock",
    signOut: () => {
      clearAuthStorage();
      window.location.replace("/login");
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Public provider ──────────────────────────────────────────────────────────

const IS_CLERK_CONFIGURED = !!(
  typeof import.meta !== "undefined" && import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY
);

export function AuthProvider({ children }: { children: ReactNode }) {
  if (IS_CLERK_CONFIGURED) {
    return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
  }
  return <MockAuthProvider>{children}</MockAuthProvider>;
}
