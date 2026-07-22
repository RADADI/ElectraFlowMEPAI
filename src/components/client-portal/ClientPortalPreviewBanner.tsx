import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { isClientPortalPreviewRole } from "@/types/client-portal-view";

export function ClientPortalPreviewBanner() {
  const { role } = useAuth();
  if (!isClientPortalPreviewRole(role)) return null;

  return (
    <Alert className="mb-4 border-amber-200 bg-amber-50">
      <Eye className="h-4 w-4 text-amber-700" />
      <AlertDescription className="text-amber-800 text-sm">
        Client portal preview — scoped view. Internal staff routes show full org data.
      </AlertDescription>
    </Alert>
  );
}
