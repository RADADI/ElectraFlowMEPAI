/**
 * Storage service — Phase 6
 *
 * Wraps Supabase Storage for document file operations.
 * All files are stored in PRIVATE buckets; clients must always use signed URLs.
 * The service role key is NEVER used here — all operations go through the
 * authenticated Supabase client (anon key + Clerk JWT + RLS).
 *
 * Storage path convention:
 *   {organization_id}/{project_id}/{document_id}/v{version}/{sanitized_filename}
 *
 * Buckets (must be created manually in Supabase Dashboard as PRIVATE):
 *   • project-documents  — all project document files
 *   • avatars            — user profile photos
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { ok, fail, type ServiceResult } from "./_base.service";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DOCUMENT_BUCKET = "project-documents";
export const AVATAR_BUCKET = "avatars";

/** Default signed URL expiry: 1 hour. */
const DEFAULT_SIGNED_URL_EXPIRY = 3600;

// ─── Path utilities ───────────────────────────────────────────────────────────

/**
 * Removes characters that are unsafe in storage paths and appends a short
 * random suffix to prevent collisions on duplicate original filenames.
 * Example: "Panel Schedule (Rev A).pdf" → "Panel_Schedule_Rev_A_k8f2j.pdf"
 */
export function sanitizeFileName(originalName: string): string {
  const ext = originalName.includes(".") ? `.${originalName.split(".").pop()}` : "";
  const base = originalName
    .replace(/\.[^/.]+$/, "") // strip extension
    .replace(/[^a-zA-Z0-9._-]/g, "_") // replace unsafe chars
    .replace(/_+/g, "_") // collapse runs of underscores
    .replace(/^_|_$/g, "") // trim leading/trailing underscores
    .slice(0, 80); // cap length
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "file"}_${suffix}${ext}`;
}

/**
 * Builds the canonical storage path for a document version.
 *
 * @param orgId       Organization UUID
 * @param projectId   Project UUID (or "no-project" if org-level document)
 * @param documentId  Document UUID
 * @param version     Version number (1, 2, 3, …)
 * @param fileName    Sanitized file name (use sanitizeFileName() first)
 */
export function buildDocumentPath(
  orgId: string,
  projectId: string | null | undefined,
  documentId: string,
  version: number,
  fileName: string,
): string {
  const projectSegment = projectId ?? "no-project";
  return `${orgId}/${projectSegment}/${documentId}/v${version}/${fileName}`;
}

// ─── File upload ──────────────────────────────────────────────────────────────

export interface UploadProgress {
  /** 0–100 */
  percent: number;
  phase: "preparing" | "uploading" | "done" | "error";
}

/**
 * Uploads a file to Supabase Storage.
 *
 * Progress simulation: Supabase JS client does not expose native XHR progress.
 * We simulate 0→90% over time and jump to 100% on completion.  For UI feedback
 * the caller should stop the simulation immediately when this resolves.
 *
 * @param bucket     Target bucket name (use DOCUMENT_BUCKET constant)
 * @param path       Full storage path (use buildDocumentPath())
 * @param file       File object from <input type="file"> or drag-drop
 * @param onProgress Optional progress callback
 * @returns          The storage path on success
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<ServiceResult<string>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<string>("Supabase Storage is not configured.");
  }

  onProgress?.({ percent: 5, phase: "preparing" });

  // Simulate upload progress while the actual upload is in flight
  let simulatedPercent = 5;
  const progressTimer = window.setInterval(() => {
    if (simulatedPercent < 88) {
      simulatedPercent = Math.min(88, simulatedPercent + Math.random() * 6 + 2);
      onProgress?.({ percent: Math.round(simulatedPercent), phase: "uploading" });
    }
  }, 300);

  try {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    clearInterval(progressTimer);

    if (error) {
      onProgress?.({ percent: 0, phase: "error" });
      return fail<string>(error);
    }

    onProgress?.({ percent: 100, phase: "done" });
    return ok(path);
  } catch (err) {
    clearInterval(progressTimer);
    onProgress?.({ percent: 0, phase: "error" });
    return fail<string>(err);
  }
}

// ─── Signed URL ───────────────────────────────────────────────────────────────

/**
 * Returns a time-limited signed URL for a private storage object.
 * Never return a public URL — all buckets must be private.
 *
 * @param bucket    Bucket name
 * @param path      Storage path of the object
 * @param expiresIn Seconds until expiry (default 3600 = 1 hour)
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = DEFAULT_SIGNED_URL_EXPIRY,
): Promise<ServiceResult<string>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<string>("Supabase Storage is not configured.");
  }

  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);

    if (error) return fail<string>(error);
    if (!data?.signedUrl) return fail<string>("Signed URL is empty.");
    return ok(data.signedUrl);
  } catch (err) {
    return fail<string>(err);
  }
}

// ─── File deletion ────────────────────────────────────────────────────────────

/**
 * Deletes a stored file.
 * Use only when rolling back a failed document INSERT to avoid orphaned files.
 * Documents are soft-deleted (deleted_at); their files remain in storage.
 */
export async function deleteFile(bucket: string, path: string): Promise<ServiceResult<void>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<void>("Supabase Storage is not configured.");
  }

  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) return fail<void>(error);
    return ok(undefined);
  } catch (err) {
    return fail<void>(err);
  }
}
