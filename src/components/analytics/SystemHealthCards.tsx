/**
 * SystemHealthCards — module counts, failures, placeholders.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSystemHealth } from "@/hooks/api/useAnalytics";

export function SystemHealthCards() {
  const { data, isLoading, isError, refetch } = useSystemHealth();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-destructive">
        <AlertTriangle className="h-6 w-6" />
        <p className="text-sm">Failed to load system health</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground text-center py-6">No system health data.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Object.entries(data.module_counts).map(([mod, count]) => (
          <Card key={mod} className="p-3">
            <p className="text-xs text-muted-foreground capitalize">{mod}</p>
            <p className="text-xl font-semibold mt-1">{count}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {data.recent_report_failures > 0 && (
          <Badge variant="destructive">{data.recent_report_failures} failed report run(s)</Badge>
        )}
        {data.last_audit_at && (
          <Badge variant="outline">
            Last audit: {new Date(data.last_audit_at).toLocaleDateString()}
          </Badge>
        )}
      </div>

      {data.missing_config.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-md p-3">
          {data.missing_config.map((m) => (
            <p key={m}>⚠ {m}</p>
          ))}
        </div>
      )}

      {data.placeholders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Future Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.placeholders.map((p) => (
              <div key={p.label} className="flex justify-between text-sm">
                <span>{p.label}</span>
                <span className="text-muted-foreground">{p.reason}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
