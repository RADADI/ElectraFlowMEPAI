import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";
import type { AppRole } from "@/lib/permissions";

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

// ─── Clerk provider ───────────────────────────────────────────────────────────

function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { user, isSignedIn, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const [, setTick] = useState(0);
  useEffect(() => {
    function refresh() {
      setTick((t) => t + 1);
    }
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
  }, []);

  const role = getStoredRole();
  const storedUser = getStoredUser();

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
    signOut: () => {
      clearAuthStorage();
      clerkSignOut({ redirectUrl: "/login" });
    },
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
