/**
 * DocumentUploadModal — Phase 6
 *
 * Handles both initial document upload and new version upload.
 * Features: drag-and-drop, file validation, progress simulation, demo mode banner.
 *
 * Props:
 *   open             — controls dialog visibility
 *   onClose          — called on success or cancel
 *   mode             — "new" (create document) | "version" (upload new version)
 *   documentId       — required when mode === "version"
 *   expectedVersion  — required when mode === "version" (optimistic lock)
 *   projectId        — pre-selected project ID (optional)
 */

import { useRef, useState, useCallback } from "react";
import { useUploadDocument, useUploadNewVersion } from "@/hooks/api/useDocuments";
import type { DocumentUploadInput, DocumentVersionInput } from "@/types/document-view";
import type { UploadProgress } from "@/services/storage.service";

const ALLOWED_EXTS = [
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".dwg",
  ".dxf",
  ".png",
  ".jpg",
  ".jpeg",
  ".zip",
];
const MAX_SIZE_MB = 100;

const DISCIPLINES = [
  "Electrical",
  "Mechanical",
  "Plumbing",
  "Fire",
  "HVAC",
  "Civil",
  "Structural",
  "General",
];

const DOC_TYPES = [
  "Drawing",
  "Specification",
  "Schedule",
  "Report",
  "Submittal",
  "Data Sheet",
  "Certificate",
  "Manual",
  "Other",
];

interface Props {
  open: boolean;
  onClose: (success?: boolean) => void;
  mode?: "new" | "version";
  documentId?: string;
  expectedVersion?: number;
  documentTitle?: string;
  projectId?: string;
  isMockMode?: boolean;
}

export function DocumentUploadModal({
  open,
  onClose,
  mode = "new",
  documentId,
  expectedVersion = 1,
  documentTitle,
  projectId,
  isMockMode = false,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState("");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [docType, setDocType] = useState("");
  const [revision, setRevision] = useState("A");
  const [description, setDescription] = useState("");
  const [changeSummary, setChangeSummary] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadNew = useUploadDocument();
  const uploadVersion = useUploadNewVersion();

  const isLoading =
    uploadNew.isPending || uploadVersion.isPending || progress?.phase === "uploading";

  const mutationError =
    (uploadNew.error as Error | null)?.message ??
    uploadNew.data?.error?.message ??
    (uploadVersion.error as Error | null)?.message ??
    uploadVersion.data?.error?.message ??
    null;

  function validateFile(f: File): string {
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
    if (!ALLOWED_EXTS.includes(ext)) {
      return `File type "${ext}" is not supported. Allowed: ${ALLOWED_EXTS.join(", ")}`;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File size exceeds ${MAX_SIZE_MB} MB limit.`;
    }
    return "";
  }

  const handleFile = useCallback(
    (f: File) => {
      const err = validateFile(f);
      if (err) {
        setFileError(err);
        setFile(null);
      } else {
        setFileError("");
        setFile(f);
        if (!title && mode === "new") {
          setTitle(f.name.replace(/\.[^/.]+$/, ""));
        }
      }
    },
    [title, mode],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function handleProgressUpdate(p: UploadProgress) {
    setProgress(p);
    if (p.phase === "done") {
      setTimeout(() => {
        onClose(true);
        resetForm();
      }, 600);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setRevisionConflict(false);

    if (mode === "version" && documentId) {
      const input: DocumentVersionInput = {
        change_summary: changeSummary || undefined,
        revision: revision || undefined,
        expected_version_number: expectedVersion,
      };
      const result = await uploadVersion.mutateAsync({
        docId: documentId,
        file,
        input,
        onProgress: handleProgressUpdate,
      });
      if (result.error?.message?.includes("REVISION_CONFLICT")) {
        setRevisionConflict(true);
        setProgress(null);
      } else if (result.data) {
        onClose(true);
        resetForm();
      }
    } else {
      const input: DocumentUploadInput = {
        title: title.trim() || file.name,
        document_number: docNumber.trim() || undefined,
        discipline: discipline || undefined,
        document_type: docType || undefined,
        revision: revision.trim() || "A",
        description: description.trim() || undefined,
        project_id: projectId || undefined,
      };
      const result = await uploadNew.mutateAsync({ input, file, onProgress: handleProgressUpdate });
      if (result.data) {
        onClose(true);
        resetForm();
      }
    }
  }

  function resetForm() {
    setFile(null);
    setTitle("");
    setDocNumber("");
    setDiscipline("");
    setDocType("");
    setRevision("A");
    setDescription("");
    setChangeSummary("");
    setProgress(null);
    setFileError("");
    setRevisionConflict(false);
    uploadNew.reset();
    uploadVersion.reset();
  }

  function handleClose() {
    if (isLoading) return;
    resetForm();
    onClose(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "version"
              ? `New Version — ${documentTitle ?? "Document"}`
              : "Upload Document"}
          </h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
            {/* Demo mode banner */}
            {isMockMode && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Demo mode — changes are temporary and disappear after refresh.
              </div>
            )}

            {/* Revision conflict warning */}
            {revisionConflict && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                This document was updated by another user. Please refresh and try again.
              </div>
            )}

            {/* File drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !isLoading && fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : file
                    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                    : "border-border hover:border-primary hover:bg-accent/30"
              } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ALLOWED_EXTS.join(",")}
                onChange={handleInputChange}
                disabled={isLoading}
              />
              {file ? (
                <>
                  <svg
                    className="h-8 w-8 text-green-500 mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                  <p className="text-xs text-primary mt-1">Click to change file</p>
                </>
              ) : (
                <>
                  <svg
                    className="h-8 w-8 text-muted-foreground mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="text-sm font-medium text-foreground">
                    Drag & drop or <span className="text-primary">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DWG, DOCX, XLSX, PNG, ZIP — max {MAX_SIZE_MB} MB
                  </p>
                </>
              )}
            </div>

            {fileError && <p className="text-xs text-destructive">{fileError}</p>}

            {/* Progress bar */}
            {progress && progress.phase !== "done" && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress.phase === "preparing" ? "Preparing…" : "Uploading…"}</span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Form fields */}
            {mode === "new" ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Title <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Panel Schedule Rev A"
                    required
                    disabled={isLoading}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Document Number
                    </label>
                    <input
                      type="text"
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      placeholder="e.g. EL-DR-001"
                      disabled={isLoading}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Revision
                    </label>
                    <input
                      type="text"
                      value={revision}
                      onChange={(e) => setRevision(e.target.value)}
                      placeholder="A"
                      disabled={isLoading}
                      maxLength={5}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Discipline
                    </label>
                    <select
                      value={discipline}
                      onChange={(e) => setDiscipline(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      <option value="">Select…</option>
                      {DISCIPLINES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Document Type
                    </label>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      <option value="">Select…</option>
                      {DOC_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Brief description of this document…"
                    disabled={isLoading}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      New Revision
                    </label>
                    <input
                      type="text"
                      value={revision}
                      onChange={(e) => setRevision(e.target.value)}
                      placeholder="B"
                      disabled={isLoading}
                      maxLength={5}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Change Summary
                  </label>
                  <textarea
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    rows={3}
                    placeholder="Describe the changes in this revision…"
                    disabled={isLoading}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                </div>
              </>
            )}

            {/* Mutation error */}
            {mutationError && !revisionConflict && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                {mutationError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || isLoading || !!fileError}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading
                ? "Uploading…"
                : mode === "version"
                  ? "Upload New Version"
                  : "Upload Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
