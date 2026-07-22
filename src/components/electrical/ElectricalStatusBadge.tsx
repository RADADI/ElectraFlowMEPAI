/**
 * Electrical workflow status badge — Phase 15B
 */

import { Badge } from "@/components/ui/badge";
import {
  ELECTRICAL_STATUS_LABEL,
  ELECTRICAL_STATUS_CLASS,
  type ElectricalWorkflowStatus,
} from "@/types/electrical-view";

interface ElectricalStatusBadgeProps {
  status: ElectricalWorkflowStatus;
  className?: string;
}

export function ElectricalStatusBadge({ status, className }: ElectricalStatusBadgeProps) {
  return (
    <Badge variant="outline" className={`${ELECTRICAL_STATUS_CLASS[status]} ${className ?? ""}`}>
      {ELECTRICAL_STATUS_LABEL[status]}
    </Badge>
  );
}
