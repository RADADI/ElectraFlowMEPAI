import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { AuditExplorerTable } from "@/components/audit/AuditExplorerTable";

export const Route = createFileRoute("/_app/audit")({
  head: () => ({ meta: [{ title: "Audit Explorer — ElectraFlow AI" }] }),
  component: () => (
    <RoleGuard allowedRoles={["Admin"]}>
      <AuditPage />
    </RoleGuard>
  ),
});

function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit Explorer"
        subtitle="Search and inspect all system audit events."
        actions={<Badge variant="secondary">Admin only</Badge>}
      />
      <AuditExplorerTable />
    </>
  );
}
