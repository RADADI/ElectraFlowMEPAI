import { useState } from "react";
import { Bell, Search, Moon, Sun, LogOut, User, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useTheme } from "@/components/theme-provider";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { NavLinks, SidebarBrand, SidebarFooter } from "@/components/layout/Sidebar";

export function Topbar() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const role = (typeof window !== "undefined" && localStorage.getItem("mep-role")) || "Admin";
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="h-14 shrink-0 bg-card border-b flex items-center gap-2 px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden shrink-0"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <SheetContent
          side="left"
          className="p-0 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col [&>button]:text-sidebar-foreground/60"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBrand />
          <NavLinks onNavigate={() => setMobileOpen(false)} />
          <SidebarFooter />
        </SheetContent>
      </Sheet>

      <div className="flex-1 max-w-xl relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search projects, documents, submittals…"
          className="pl-9 h-9 bg-muted/40"
        />
      </div>
      <div className="hidden md:block text-sm text-muted-foreground">Acme Engineering Co.</div>
      <Badge variant="outline" className="hidden md:inline-flex">
        {role}
      </Badge>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => toast.info("3 new notifications")}
      >
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                AH
              </AvatarFallback>
            </Avatar>
            <span className="hidden md:inline text-sm">Ahmed H.</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <User className="h-4 w-4 mr-2" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              localStorage.removeItem("mep-role");
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
