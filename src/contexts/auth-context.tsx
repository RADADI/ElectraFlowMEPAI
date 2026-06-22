import { createContext, useContext, type ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";
import type { AppRole } from "@/lib/permissions";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_KEY = "mep-role";

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

function toInitials(name: string): string {
  return name
    .split(" ")
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

  const displayName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress?.split("@")[0] || "User";

  const value: AuthState = {
    isSignedIn: isLoaded && !!isSignedIn,
    isLoaded,
    role,
    displayName,
    email: user?.primaryEmailAddress?.emailAddress || "",
    imageUrl: user?.imageUrl || null,
    initials: toInitials(displayName),
    signOut: () => {
      clearStoredRole();
      signOut({ redirectUrl: "/login" });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Used when no Clerk key is set — pure localStorage mock. */
function MockAuthProvider({ children }: { children: ReactNode }) {
  const role = getStoredRole();
  const isSignedIn = typeof window !== "undefined" && !!localStorage.getItem(ROLE_KEY);
  const displayName = role ? `Demo ${role}` : "Guest";

  const value: AuthState = {
    isSignedIn,
    isLoaded: true,
    role,
    displayName,
    email: "demo@electraflow.ai",
    imageUrl: null,
    initials: role ? toInitials(role) || role.slice(0, 2).toUpperCase() : "GU",
    signOut: () => {
      clearStoredRole();
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
 * It automatically selects Clerk mode vs mock mode based on the env var.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (IS_CLERK_CONFIGURED) {
    return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
  }
  return <MockAuthProvider>{children}</MockAuthProvider>;
}
