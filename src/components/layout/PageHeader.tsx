import { Fragment, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type Crumb = { label: string; href?: string };

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  breadcrumbs?: Crumb[];
}) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb className="mb-2">
          <BreadcrumbList>
            {breadcrumbs.map((crumb, i) => (
              <Fragment key={i}>
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {i < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  trend,
  icon: Icon,
  intent = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: string;
  icon?: React.ComponentType<{ className?: string }>;
  intent?: "default" | "success" | "warning" | "destructive" | "info";
}) {
  const intentBg = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    info: "bg-info/15 text-info",
  }[intent];
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {Icon && (
          <div className={cn("h-8 w-8 rounded-md grid place-items-center shrink-0", intentBg)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {(hint || trend) && (
        <div className="flex items-center justify-between text-xs">
          {hint && <span className="text-muted-foreground">{hint}</span>}
          {trend && <span className="text-success font-medium">{trend}</span>}
        </div>
      )}
    </div>
  );
}
