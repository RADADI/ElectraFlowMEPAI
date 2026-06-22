/**
 * Base service utilities — Phase 3
 *
 * Every service in this folder follows the same result pattern so React Query
 * hooks, error boundaries, and UI components all handle data consistently.
 *
 * Pattern:
 *   { data: T, error: null, isMockData: boolean }     — success
 *   { data: null, error: ServiceError, isMockData: boolean } — failure
 */

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ServiceError {
  message: string;
  code?: string;
}

export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
  isMockData: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a Supabase PostgrestError (or any unknown value) into a ServiceError. */
export function normalizeError(err: unknown): ServiceError {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { message: string; code?: string };
    return { message: e.message, code: e.code };
  }
  if (typeof err === "string") return { message: err };
  return { message: "An unexpected error occurred." };
}

/** Build a successful ServiceResult wrapping real DB data. */
export function ok<T>(data: T): ServiceResult<T> {
  return { data, error: null, isMockData: false };
}

/** Build a successful ServiceResult wrapping mock/dummy data. */
export function mockOk<T>(data: T): ServiceResult<T> {
  return { data, error: null, isMockData: true };
}

/** Build a failed ServiceResult — never expose raw Supabase error to the UI. */
export function fail<T>(err: unknown): ServiceResult<T> {
  return { data: null, error: normalizeError(err), isMockData: false };
}
