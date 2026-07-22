import { useState } from "react";
import { Search, Moon, Sun, LogOut, User, Settings, ChevronDown, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { NavLinks, SidebarBrand, SidebarFooter } from "@/components/layout/Sidebar";
import { useAuth } from "@/contexts/auth-context";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function Topbar() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { displayName, email, company, imageUrl, initials, role, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="h-14 shrink-0 bg-card border-b flex items-center gap-2 px-4">
      {/* Mobile nav trigger */}
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

      {/* Global search */}
      <div className="flex-1 max-w-xl relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search projects, documents, submittals…"
          className="pl-9 h-9 bg-muted/40"
        />
      </div>

      {company && (
        <div className="hidden md:block text-sm text-muted-foreground truncate max-w-[160px]">
          {company}
        </div>
      )}

      {/* Role badge */}
      {role && (
        <Badge variant="outline" className="hidden md:inline-flex">
          {role}
        </Badge>
      )}

      {/* Theme toggle */}
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {/* Notifications */}
      <NotificationBell />

      {/* User profile dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2 h-9">
            <Avatar className="h-7 w-7">
              {imageUrl && <AvatarImage src={imageUrl} alt={displayName} />}
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden md:inline text-sm max-w-[120px] truncate">{displayName}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden md:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{displayName}</p>
              {email && (
                <p className="text-xs leading-none text-muted-foreground truncate">{email}</p>
              )}
              {role && (
                <Badge variant="secondary" className="mt-1 w-fit text-xs">
                  {role}
                </Badge>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
            <User className="h-4 w-4 mr-2" />
            My Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={signOut}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
