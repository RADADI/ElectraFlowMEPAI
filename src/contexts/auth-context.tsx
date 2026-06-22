import { createContext, useContext, type ReactNode } from "react";
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

// ─── localStorage helpers ─────────────────────────────────────────────────────

const ROLE_KEY = "mep-role";
const USER_KEY = "mep-user";
const ONBOARDING_KEY = "mep-onboarding-done";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Inner providers ─────────────────────────────────────────────────────────

/** Used when VITE_CLERK_PUBLISHABLE_KEY is set — reads from Clerk. */
function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { user, isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const role = getStoredRole();
  // Prefer Clerk user data; fall back to what was stored at signup
  const storedUser = getStoredUser();

  const displayName =
    user?.fullName ||
    storedUser?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "User";

  const email = user?.primaryEmailAddress?.emailAddress || storedUser?.email || "";

  const value: AuthState = {
    isSignedIn: isLoaded && !!isSignedIn,
    isLoaded,
    role,
    displayName,
    email,
    imageUrl: user?.imageUrl || null,
    initials: toInitials(displayName) || "EF",
    signOut: () => {
      clearStoredRole();
      clearStoredUser();
      clearOnboardingDone();
      signOut({ redirectUrl: "/login" });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Used when no Clerk key is set — pure localStorage mock. */
function MockAuthProvider({ children }: { children: ReactNode }) {
  const role = getStoredRole();
  const storedUser = getStoredUser();
  const isSignedIn = typeof window !== "undefined" && !!localStorage.getItem(ROLE_KEY);

  // Use real name from signup if available; fall back to "Demo <Role>"
  const displayName = storedUser?.fullName || (role ? `Demo ${role}` : "Guest");
  const email = storedUser?.email || "demo@electraflow.ai";
  const initials = toInitials(displayName) || role?.slice(0, 2).toUpperCase() || "EF";

  const value: AuthState = {
    isSignedIn,
    isLoaded: true,
    role,
    displayName,
    email,
    imageUrl: null,
    initials,
    signOut: () => {
      clearStoredRole();
      clearStoredUser();
      clearOnboardingDone();
      if (typeof window !== "undefined") window.location.href = "/login";
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Public provider ─────────────────────────────────────────────────────────

const IS_CLERK_CONFIGURED = !!(
  typeof import.meta !== "undefined" && import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY
);

/**
 * Wrap the app (or a subtree) with this provider.
 * Automatically selects Clerk mode vs mock mode based on env var.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (IS_CLERK_CONFIGURED) {
    return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
  }
  return <MockAuthProvider>{children}</MockAuthProvider>;
}
