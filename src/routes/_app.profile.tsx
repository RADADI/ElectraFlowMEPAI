import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/auth-context";
import { useCurrentProfile, useUpdateProfile } from "@/hooks/api/useProfiles";
import { toast } from "sonner";
import {
  User,
  Mail,
  Building2,
  Shield,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Phone,
  Briefcase,
} from "lucide-react";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "My Profile — ElectraFlow AI" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { displayName, email, imageUrl, initials, role, company } = useAuth();

  const profileQuery = useCurrentProfile();
  const profile = profileQuery.data;

  const updateMut = useUpdateProfile(profile?.id ?? "");

  // Edit state
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  function startEdit() {
    setFullName(profile?.full_name ?? displayName ?? "");
    setPhone(profile?.phone ?? "");
    setTitle(profile?.title ?? "");
    setSaveError(null);
    setSaveSuccess(false);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    if (!profile?.id) {
      setSaveError("Cannot update profile — profile ID not available.");
      return;
    }

    const result = await updateMut.mutateAsync({
      full_name: fullName.trim() || undefined,
      phone: phone.trim() || null,
      title: title.trim() || null,
    });

    if (result.error) {
      setSaveError(result.error.message ?? "Failed to save profile.");
      return;
    }

    setSaveSuccess(true);
    setEditing(false);
    toast.success("Profile updated.");
  }

  // Loading state
  if (profileQuery.isLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <PageHeader title="My Profile" subtitle="Your account details and preferences." />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (profileQuery.isError) {
    return (
      <div className="space-y-6 max-w-2xl">
        <PageHeader title="My Profile" subtitle="Your account details and preferences." />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load profile. Check your connection and try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => profileQuery.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const displayFullName = profile?.full_name ?? displayName ?? "—";
  const displayEmail = profile?.email ?? email ?? "—";
  const displayRole = role ?? profile?.role ?? "—";
  const displayCompany = company ?? "—";
  const isMock = profileQuery.data === null && !profileQuery.isLoading;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="My Profile"
        subtitle="Your account details and preferences."
        actions={
          !editing ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              Edit Profile
            </Button>
          ) : undefined
        }
      />

      {profileQuery.data === null && !profileQuery.isLoading && !profileQuery.isError && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertDescription className="text-yellow-700 text-sm">
            Demo mode — profile data is not persisted. Connect Supabase to save changes.
          </AlertDescription>
        </Alert>
      )}

      {saveSuccess && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">Profile saved.</AlertDescription>
        </Alert>
      )}

      {/* Identity card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {imageUrl && <AvatarImage src={imageUrl} alt={displayFullName} />}
              <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold">{displayFullName}</p>
              {profile?.title && <p className="text-sm text-muted-foreground">{profile.title}</p>}
              <Badge variant="secondary" className="mt-1 text-xs">
                {displayRole}
              </Badge>
            </div>
          </div>

          <Separator />

          {editing ? (
            <form onSubmit={handleSave} className="space-y-4">
              {saveError && (
                <Alert variant="destructive">
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="prof-name">Full Name</Label>
                <Input
                  id="prof-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-title">Title / Position</Label>
                <Input
                  id="prof-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Electrical Engineer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-phone">Phone</Label>
                <Input
                  id="prof-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+966 XX XXX XXXX"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={updateMut.isPending}>
                  {updateMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Save Changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={updateMut.isPending}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-2.5">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
                  <p className="font-medium break-all">{displayEmail}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Role</p>
                  <p className="font-medium">{displayRole}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Organisation
                  </p>
                  <p className="font-medium">{displayCompany}</p>
                </div>
              </div>
              {profile?.phone && (
                <div className="flex items-start gap-2.5">
                  <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Phone</p>
                    <p className="font-medium">{profile.phone}</p>
                  </div>
                </div>
              )}
              {profile?.department && (
                <div className="flex items-start gap-2.5">
                  <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Department
                    </p>
                    <p className="font-medium">{profile.department}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Account Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            {profile?.is_active !== false ? (
              <Badge className="bg-green-100 text-green-700">Active</Badge>
            ) : (
              <Badge variant="destructive">Inactive</Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Onboarding</span>
            {profile?.onboarding_done ? (
              <Badge className="bg-green-100 text-green-700">Complete</Badge>
            ) : (
              <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last updated</span>
            <span className="text-xs text-muted-foreground">
              {profile?.updated_at
                ? new Date(profile.updated_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "—"}
            </span>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            To change your password or email, manage your account through your identity provider.
            Contact your administrator if you need assistance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
