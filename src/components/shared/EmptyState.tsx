import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SearchX } from "lucide-react";

export function EmptyState({
  icon: Icon = SearchX,
  title = "No results found",
  description = "Try adjusting your search or filters.",
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center py-16 text-center px-4", className)}
    >
      <div className="h-14 w-14 rounded-full bg-muted grid place-items-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
