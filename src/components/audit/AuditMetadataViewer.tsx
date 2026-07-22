/**
 * AuditMetadataViewer — safe JSON display (no innerHTML).
 */

import type { AuditLog } from "@/types/database";

interface AuditMetadataViewerProps {
  event: AuditLog;
}

function JsonBlock({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        <p className="text-sm text-muted-foreground italic">Empty</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export function AuditMetadataViewer({ event }: AuditMetadataViewerProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <JsonBlock label="Previous data" data={event.old_data} />
      <JsonBlock label="New data" data={event.new_data} />
    </div>
  );
}
