import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClientAnnouncementBanner } from "@/components/client-portal/ClientAnnouncementBanner";
import { ClientPortalPreviewBanner } from "@/components/client-portal/ClientPortalPreviewBanner";
import { ClientPortalTabs } from "@/components/client-portal/ClientPortalTabs";
import { ArrowLeft, RefreshCw, AlertTriangle } from "lucide-react";

export function ClientPortalShell({
  title,
  subtitle,
  children,
  onRetry,
  error,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRetry?: () => void;
  error?: boolean;
}) {
  return (
    <RoleGuard allowedRoles={["Admin", "Client"]}>
      <ClientAnnouncementBanner />
      <ClientPortalPreviewBanner />
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/client-portal">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Portal home
            </Link>
          </Button>
        }
      />
      <ClientPortalTabs />
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>Failed to load data. Check your connection and try again.</span>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Retry
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {children}
    </RoleGuard>
  );
}

export function flattenPages<T>(pages: { data?: { items: T[] } | null }[] | undefined): T[] {
  return pages?.flatMap((p) => p.data?.items ?? []) ?? [];
}
