// Convenience re-export so components can import from either location.
export {
  useAuth,
  getStoredRole,
  setStoredRole,
  clearStoredRole,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  setMockSession,
  clearAuthStorage,
  notifyAuthChange,
} from "@/contexts/auth-context";

export type { AuthState, StoredUser } from "@/contexts/auth-context";
