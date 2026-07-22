/**
 * Panel load summary — Phase 15B
 *
 * Displays computed totals, per-phase loads, and heuristic warnings.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ElectricalWarningBadge } from "@/components/electrical/ElectricalWarningBadge";
import { ELECTRICAL_CONFIG } from "@/lib/electrical-calculations";
import type { PanelLoadSummaryView } from "@/types/electrical-view";
import { AlertTriangle, Zap } from "lucide-react";

interface PanelLoadSummaryProps {
  summary?: PanelLoadSummaryView | null;
  isLoading?: boolean;
  className?: string;
}

function formatVa(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} VA`;
}

export function PanelLoadSummary({ summary, isLoading, className }: PanelLoadSummaryProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <EmptyState
            icon={Zap}
            title="No load data"
            description="Add circuits to see computed panel loads."
          />
        </CardContent>
      </Card>
    );
  }

  const phaseEntries = Object.entries(summary.phase_loads).filter(
    ([, va]) => va > 0 || summary.circuit_count > 0,
  );

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          Load summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Total connected</p>
            <p className="text-lg font-semibold">{formatVa(summary.total_connected_load_va)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Circuits</p>
            <p className="text-lg font-semibold">{summary.circuit_count}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Warnings</p>
            <p className="text-lg font-semibold flex items-center gap-1">
              {summary.warnings.length > 0 && (
                <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
              )}
              {summary.warnings.length}
            </p>
          </div>
        </div>

        {phaseEntries.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Phase loads</p>
            <div className="grid grid-cols-3 gap-2">
              {(["A", "B", "C"] as const).map((phase) => (
                <div key={phase} className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Phase {phase}</p>
                  <p className="text-sm font-medium">{formatVa(summary.phase_loads[phase] ?? 0)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary.warnings.length > 0 ? (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Review warnings</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.warnings.map((w, i) => (
                <ElectricalWarningBadge key={`${w.code}-${i}`} warning={w} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No heuristic warnings detected.</p>
        )}

        <p className="text-[10px] text-muted-foreground leading-snug">
          {ELECTRICAL_CONFIG.calculationDisclaimer}
        </p>
      </CardContent>
    </Card>
  );
}
