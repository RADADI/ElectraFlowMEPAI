// Convenience re-export so components can import auth helpers from either location.
export {
  useAuth,
  // Low-level session keys
  getStoredRole,
  setStoredRole,
  clearStoredRole,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  setOnboardingDone,
  clearOnboardingDone,
  isOnboardingDone,
  // User registry
  getRegisteredUsers,
  findUserByEmail,
  registerUser,
  updateRegisteredUser,
  validateLogin,
  // High-level session helpers
  setActiveSession,
  setMockSession,
  clearAuthStorage,
  notifyAuthChange,
} from "@/contexts/auth-context";

export type { AuthState, StoredUser, MockUser, LoginResult } from "@/contexts/auth-context";
