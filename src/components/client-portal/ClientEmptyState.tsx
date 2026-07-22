import { EmptyState } from "@/components/shared/EmptyState";
import { ShieldOff } from "lucide-react";

export function ClientEmptyState({
  title = "Nothing shared yet",
  description = "When your project team shares documents or updates, they will appear here.",
}: {
  title?: string;
  description?: string;
}) {
  return <EmptyState title={title} description={description} />;
}

export function ClientAccessDeniedState() {
  return (
    <EmptyState
      icon={ShieldOff}
      title="Access denied"
      description="This record is not shared with your account."
    />
  );
}
