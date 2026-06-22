import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldX, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({ meta: [{ title: "Access Denied — ElectraFlow AI" }] }),
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  const { role, displayName } = useAuth();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <ShieldX className="h-10 w-10 text-destructive" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Access Denied</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {displayName && (
              <>
                <span className="font-medium text-foreground">{displayName}</span>
                {role && (
                  <>
                    {" "}
                    (<span className="font-medium text-foreground">{role}</span>)
                  </>
                )}
                {" — "}
              </>
            )}
            You don't have permission to view this page. Please contact your administrator if you
            believe this is an error.
          </p>
        </div>

        {/* Role badge */}
        {role && (
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-1.5 text-sm">
            <span className="text-muted-foreground">Current role:</span>
            <span className="font-semibold text-foreground">{role}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go back
          </Button>
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
