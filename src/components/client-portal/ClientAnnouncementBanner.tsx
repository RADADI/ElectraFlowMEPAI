import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Megaphone, X } from "lucide-react";
import { useState } from "react";
import { useClientAnnouncements } from "@/hooks/api/useClientPortal";

export function ClientAnnouncementBanner() {
  const { data: announcements = [] } = useClientAnnouncements();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const first = visible[0];

  return (
    <Alert className="mb-4 border-blue-200 bg-blue-50 relative pr-10">
      <Megaphone className="h-4 w-4 text-blue-600" />
      <AlertTitle className="text-blue-900">{first.title}</AlertTitle>
      <AlertDescription className="text-blue-800 text-sm">{first.message}</AlertDescription>
      <button
        type="button"
        onClick={() => setDismissed((s) => new Set(s).add(first.id))}
        className="absolute top-3 right-3 text-blue-600 hover:text-blue-900"
        aria-label="Dismiss announcement"
      >
        <X className="h-4 w-4" />
      </button>
    </Alert>
  );
}
