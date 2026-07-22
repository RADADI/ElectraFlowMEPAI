/**
 * Electrical warning badge — Phase 15B
 */

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info } from "lucide-react";
import type { ElectricalWarning } from "@/types/electrical-view";

interface ElectricalWarningBadgeProps {
  warning: ElectricalWarning;
  className?: string;
}

const SEVERITY_CLASS: Record<ElectricalWarning["severity"], string> = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
};

export function ElectricalWarningBadge({ warning, className }: ElectricalWarningBadgeProps) {
  const Icon = warning.severity === "warning" ? AlertTriangle : Info;

  return (
    <Badge
      variant="outline"
      className={`gap-1 font-normal ${SEVERITY_CLASS[warning.severity]} ${className ?? ""}`}
      title={warning.code}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {warning.message}
    </Badge>
  );
}
