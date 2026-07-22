import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ShieldX, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({ meta: [{ title: "Access Denied — ElectraFlow AI" }] }),
  component: UnauthorizedPage,
});

/**
 * Navigates back in router history if there is a previous in-app entry,
 * otherwise falls back to the Dashboard ("/").
 * Using router.history ensures we stay within the SPA and never leave the app.
 */
function useSafeBack() {
  const router = useRouter();
  return function goBack() {
    // window.history.length === 1 means this is the first page visited.
    // window.history.length === 2 typically means the only prior entry is /login.
    // In both cases, going "back" would be unhelpful — go to Dashboard instead.
    if (typeof window !== "undefined" && window.history.length > 2) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };
}

function UnauthorizedPage() {
  const { role, displayName } = useAuth();
  const goBack = useSafeBack();

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
            You don&apos;t have permission to view this page. Please contact your administrator if
            you believe this is an error.
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
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go back
          </Button>
          {/* Link to "/" — Dashboard is accessible to every authenticated role */}
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
