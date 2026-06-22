import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";
import type { AppRole } from "@/lib/permissions";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoredUser {
  fullName: string;
  email: string;
  company: string;
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
  signOut: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// ─── localStorage key constants ───────────────────────────────────────────────

const ROLE_KEY = "mep-role";
const USER_KEY = "mep-user";
const ONBOARDING_KEY = "mep-onboarding-done";

/**
 * Custom event fired by setMockSession / clearAuthStorage so that
 * providers immediately update their React state without a page reload.
 */
const AUTH_CHANGE_EVENT = "mep-auth-change";

// ─── Low-level localStorage helpers ──────────────────────────────────────────

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

// ─── High-level session helpers ───────────────────────────────────────────────

/**
 * Notifies all auth providers to re-read localStorage and update their state.
 * Call this after any direct localStorage write that isn't already handled
 * by setMockSession / clearAuthStorage.
 */
export function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
  }
}

/**
 * Atomically writes a full session (user profile + role) to localStorage
 * and immediately notifies providers so React state updates without a reload.
 *
 * Always call this instead of bare setStoredUser + setStoredRole.
 */
export function setMockSession(user: StoredUser, role: AppRole) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(ROLE_KEY, role);
  notifyAuthChange();
}

/**
 * Removes all auth-related keys from localStorage and notifies providers
 * so React state is cleared immediately, before any page redirect.
 */
export function clearAuthStorage() {
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

/** Read the current session snapshot from localStorage. */
function readSession() {
  return { role: getStoredRole(), user: getStoredUser() };
}

// ─── Clerk provider ───────────────────────────────────────────────────────────

/**
 * Used when VITE_CLERK_PUBLISHABLE_KEY is set.
 * Clerk supplies the real user identity; localStorage only tracks the role.
 * Listens to AUTH_CHANGE_EVENT so role changes propagate immediately.
 */
function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { user, isSignedIn, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  // Force a re-render whenever role or user storage changes.
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

  // Clerk data takes priority; stored user is the fallback for roles not yet
  // synced by Clerk (e.g., right after finalize() before useUser refreshes).
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
    signOut: () => {
      clearAuthStorage();
      clerkSignOut({ redirectUrl: "/login" });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Mock provider ────────────────────────────────────────────────────────────

/**
 * Used when no Clerk key is set — pure localStorage mock.
 *
 * Auth state lives in React state (not bare localStorage reads) so that
 * setMockSession / clearAuthStorage update the UI immediately without a
 * page reload or waiting for the next re-render cycle.
 */
function MockAuthProvider({ children }: { children: ReactNode }) {
  // Seed state from localStorage on first render.
  const [session, setSession] = useState(() => readSession());

  // Re-read whenever login / logout helpers fire the custom event.
  useEffect(() => {
    function refresh() {
      setSession(readSession());
    }
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
  }, []);

  const { role, user: storedUser } = session;
  const isSignedIn = !!role;

  // Prefer the name set at signup/login; fall back to a role-based placeholder.
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
    signOut: () => {
      // 1. Clear state + notify providers (reactive update).
      clearAuthStorage();
      // 2. Replace current history entry so "back" can't return to the app.
      window.location.replace("/login");
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Public provider ──────────────────────────────────────────────────────────

const IS_CLERK_CONFIGURED = !!(
  typeof import.meta !== "undefined" && import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY
);

/**
 * Wrap the app root with this provider.
 * Automatically selects Clerk mode vs mock mode based on env var.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (IS_CLERK_CONFIGURED) {
    return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
  }
  return <MockAuthProvider>{children}</MockAuthProvider>;
}
