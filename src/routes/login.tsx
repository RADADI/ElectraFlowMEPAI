import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap } from "lucide-react";
import { ROLES } from "@/lib/dummy-data";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — MEPFlow AI" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string>("Admin");
  const [email, setEmail] = useState("demo@mepflow.ai");
  const [pwd, setPwd] = useState("demo1234");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("mep-role", role);
    toast.success(`Signed in as ${role}`);
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ background: "radial-gradient(circle at 20% 20%, oklch(0.6 0.2 255 / 0.5), transparent 40%), radial-gradient(circle at 80% 60%, oklch(0.55 0.2 200 / 0.4), transparent 50%)" }} />
        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sidebar-primary grid place-items-center"><Zap className="h-6 w-6 text-sidebar-primary-foreground" /></div>
          <div>
            <div className="font-semibold text-lg">MEPFlow AI</div>
            <div className="text-xs text-sidebar-foreground/60 uppercase tracking-wider">Enterprise Engineering Platform</div>
          </div>
        </div>
        <div className="relative space-y-4 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">The intelligent operating system for MEP engineering firms.</h2>
          <p className="text-sidebar-foreground/70">Project management, AI submittal review, resource planning, financial forecasting — unified in one workspace trusted by leading engineering teams.</p>
          <div className="flex gap-6 pt-4 text-sm">
            <div><div className="text-2xl font-semibold">12k+</div><div className="text-sidebar-foreground/60">Submittals reviewed</div></div>
            <div><div className="text-2xl font-semibold">340+</div><div className="text-sidebar-foreground/60">Active projects</div></div>
            <div><div className="text-2xl font-semibold">99.9%</div><div className="text-sidebar-foreground/60">Uptime SLA</div></div>
          </div>
        </div>
        <div className="relative text-xs text-sidebar-foreground/50">© 2025 MEPFlow AI · SOC 2 · ISO 27001</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <form onSubmit={submit} className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-md bg-primary grid place-items-center"><Zap className="h-5 w-5 text-primary-foreground" /></div>
            <span className="font-semibold">MEPFlow AI</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
            <p className="text-sm text-muted-foreground mt-1">Welcome back. Please enter your credentials.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pwd">Password</Label>
              <button type="button" onClick={() => toast.info("Reset link sent (demo)")} className="text-xs text-primary hover:underline">Forgot password?</button>
            </div>
            <Input id="pwd" type="password" value={pwd} onChange={e => setPwd(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Demo role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Choose any role to explore the app from that perspective.</p>
          </div>
          <Button type="submit" className="w-full h-10">Sign in</Button>
          <div className="text-xs text-center text-muted-foreground">By signing in you agree to the Terms and Privacy Policy.</div>
        </form>
      </div>
    </div>
  );
}
