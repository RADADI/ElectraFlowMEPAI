/**
 * ExecutiveDashboardGrid — role-aware widget grid using WIDGET_REGISTRY.
 */

import { useMemo } from "react";
import { StatCard } from "@/components/layout/PageHeader";
import { MetricWidgetShell } from "@/components/analytics/MetricWidgetShell";
import { useExecutiveSummary } from "@/hooks/api/useAnalytics";
import { useDashboardPreferences } from "@/hooks/api/useDashboard";
import { useAuth } from "@/contexts/auth-context";
import { getWidget, getWidgetsForRole } from "@/lib/widget-registry";
import { formatMoney } from "@/lib/dummy-data";
import type { MetricValue } from "@/types/analytics-view";
import { cn } from "@/lib/utils";

function formatValue(kpi: MetricValue | undefined): string {
  if (!kpi || kpi.notConfigured) return "—";
  if (typeof kpi.value === "number") {
    if (
      kpi.label.toLowerCase().includes("budget") ||
      kpi.label.toLowerCase().includes("cost") ||
      kpi.label.toLowerCase().includes("ar")
    ) {
      return formatMoney(kpi.value);
    }
    return String(kpi.value);
  }
  return String(kpi.value);
}

function intentFromKpi(
  kpi: MetricValue | undefined,
): "default" | "success" | "warning" | "destructive" | "info" {
  if (!kpi?.intent || kpi.intent === "neutral") return "default";
  if (kpi.intent === "error") return "destructive";
  return kpi.intent;
}

interface WidgetCardProps {
  widgetId: string;
  kpi: MetricValue | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function WidgetCard({ widgetId, kpi, isLoading, isError, onRetry }: WidgetCardProps) {
  const widget = getWidget(widgetId);
  if (!widget) return null;

  if (widget.future) {
    return <MetricWidgetShell label={widget.label} notConfigured />;
  }

  return (
    <MetricWidgetShell
      label={widget.label}
      isLoading={isLoading}
      isError={isError}
      isEmpty={!kpi && !isLoading && !isError}
      onRetry={onRetry}
    >
      <StatCard
        label={widget.label}
        value={formatValue(kpi)}
        trend={kpi?.trend}
        intent={intentFromKpi(kpi)}
      />
    </MetricWidgetShell>
  );
}

export function ExecutiveDashboardGrid() {
  const { role } = useAuth();
  const { data, isLoading, isError, refetch } = useExecutiveSummary();
  const prefsQ = useDashboardPreferences("executive", role);

  const widgetIds = useMemo(() => {
    const prefs = prefsQ.data?.data;
    const hidden = new Set(prefs?.hidden_widgets ?? []);
    const layout = prefs?.layout?.length ? prefs.layout : getWidgetsForRole(role).map((w) => w.id);
    return layout.filter((id) => !hidden.has(id));
  }, [prefsQ.data, role]);

  const kpis = data?.data?.kpis ?? {};

  const sections = useMemo(() => {
    const cats = new Map<string, string[]>();
    for (const id of widgetIds) {
      const w = getWidget(id);
      if (!w || (w.future && !w.analyticsKey)) continue;
      if (w.roles && role && role !== "Admin" && !w.roles.includes(role)) continue;
      const list = cats.get(w.category) ?? [];
      list.push(id);
      cats.set(w.category, list);
    }
    return Array.from(cats.entries());
  }, [widgetIds, role]);

  if (sections.length === 0 && !isLoading) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        <p className="font-medium">No widgets available for your role.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {data?.isMockData && (
        <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md text-center">
          Demo data — metrics shown are computed from sample data
          {data.data?.from_snapshot ? " (cached snapshot)" : ""}
        </p>
      )}
      {sections.map(([category, ids]) => (
        <section key={category}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 capitalize">
            {category.replace("_", " ")}
          </h2>
          <div className={cn("grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3")}>
            {ids.map((id) => (
              <WidgetCard
                key={id}
                widgetId={id}
                kpi={kpis[getWidget(id)?.analyticsKey ?? id]}
                isLoading={isLoading}
                isError={!!isError}
                onRetry={() => refetch()}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
