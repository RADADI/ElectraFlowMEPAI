import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  useUsers,
  useChangeRole,
  useDeactivateUser,
  useReactivateUser,
} from "@/hooks/api/useUsers";
import {
  useInvites,
  useCreateInvite,
  useCancelInvite,
  useResendInvite,
} from "@/hooks/api/useInvites";
import type { UserRole } from "@/types/database";
import type { UserView } from "@/services/user.service";
import type { InvitationView } from "@/services/invite.service";
import { Users, Mail, Plus, RefreshCw, Copy, AlertCircle, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/users")({
  head: () => ({ meta: [{ title: "User Management — ElectraFlow AI" }] }),
  component: UsersPage,
});

// ─── Role options ─────────────────────────────────────────────────────────────

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "project_manager", label: "Project Manager" },
  { value: "senior_electrical_engineer", label: "Senior Electrical Engineer" },
  { value: "electrical_engineer", label: "Electrical Engineer" },
  { value: "qa_qc_engineer", label: "QA/QC Engineer" },
  { value: "hr", label: "HR" },
  { value: "executive", label: "Executive" },
  { value: "client", label: "Client" },
];

function roleLabel(role: UserRole): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

function InviteModal({
  open,
  onClose,
  isMockMode,
}: {
  open: boolean;
  onClose: (created?: InvitationView) => void;
  isMockMode: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("electrical_engineer");
  const [emailErr, setEmailErr] = useState("");

  const createInvite = useCreateInvite();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailErr("Please enter a valid email address.");
      return;
    }
    setEmailErr("");

    const result = await createInvite.mutateAsync({ email: trimmed, role });
    if (result.data) {
      onClose(result.data);
      setEmail("");
      setRole("electrical_engineer");
    } else {
      setEmailErr(result.error?.message ?? "Failed to create invitation.");
    }
  }

  function handleClose() {
    if (createInvite.isPending) return;
    setEmail("");
    setRole("electrical_engineer");
    setEmailErr("");
    createInvite.reset();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
        <h2 className="text-base font-semibold text-foreground">Invite Team Member</h2>

        {isMockMode && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            Demo mode — invite not actually sent.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Email Address <span className="text-destructive">*</span>
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              disabled={createInvite.isPending}
            />
            {emailErr && <p className="text-xs text-destructive mt-1">{emailErr}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Role <span className="text-destructive">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              disabled={createInvite.isPending}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {ROLE_OPTIONS.filter((r) => r.value !== "admin").map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              The user cannot change their own role. Only Admin can change roles.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={createInvite.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createInvite.isPending}>
              {createInvite.isPending ? "Sending…" : "Send Invite"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "members" | "invites";

// ─── Main page ────────────────────────────────────────────────────────────────

function UsersPage() {
  const { isJwtReady } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("members");
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserView | null>(null);

  const {
    data: users = [],
    isLoading: usersLoading,
    isError: usersError,
    refetch: refetchUsers,
  } = useUsers();
  const {
    data: invites = [],
    isLoading: invitesLoading,
    isError: invitesError,
    refetch: refetchInvites,
  } = useInvites();

  const changeRole = useChangeRole();
  const deactivateUser = useDeactivateUser();
  const reactivateUser = useReactivateUser();
  const cancelInvite = useCancelInvite();
  const resendInvite = useResendInvite();

  const isMockMode = !isJwtReady;

  const filteredUsers = users.filter(
    (u) =>
      !search ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      roleLabel(u.role).toLowerCase().includes(search.toLowerCase()),
  );

  const filteredInvites = invites.filter(
    (i) => !search || i.email.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleRoleChange(userId: string, newRole: UserRole) {
    const result = await changeRole.mutateAsync({ profileId: userId, newRole });
    if (result.data) toast.success("Role updated.");
    else toast.error(result.error?.message ?? "Failed to update role.");
  }

  async function handleDeactivate(user: UserView) {
    setConfirmDeactivate(null);
    const result = await deactivateUser.mutateAsync(user.id);
    if (result.data) toast.success(`${user.full_name} has been deactivated.`);
    else toast.error(result.error?.message ?? "Failed to deactivate.");
  }

  async function handleReactivate(user: UserView) {
    const result = await reactivateUser.mutateAsync(user.id);
    if (result.data) toast.success(`${user.full_name} reactivated.`);
    else toast.error(result.error?.message ?? "Failed to reactivate.");
  }

  async function handleCancelInvite(id: string) {
    const result = await cancelInvite.mutateAsync(id);
    if (result.data) toast.success("Invitation cancelled.");
    else toast.error(result.error?.message ?? "Failed to cancel.");
  }

  async function handleResendInvite(inv: InvitationView) {
    const result = await resendInvite.mutateAsync(inv.id);
    if (result.data) {
      const rawToken = result.data.rawToken;
      if (rawToken) {
        const url = `${window.location.origin}/invite/${rawToken}`;
        navigator.clipboard
          .writeText(url)
          .then(() => toast.success("New invite link copied to clipboard."))
          .catch(() => toast.info(`New invite link: ${url}`));
      } else {
        toast.success("Invite resent.");
      }
    } else {
      toast.error(result.error?.message ?? "Failed to resend.");
    }
  }

  function handleInviteCreated(inv?: InvitationView) {
    setInviteOpen(false);
    if (inv?.rawToken) {
      const url = `${window.location.origin}/invite/${inv.rawToken}`;
      navigator.clipboard
        .writeText(url)
        .then(() => toast.success("Invitation sent! Invite link copied to clipboard."))
        .catch(() => toast.success(`Invite created. Link: ${url}`));
    } else if (inv) {
      toast.success("Invitation created.");
    }
    refetchInvites();
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "members", label: `Team Members (${users.length})` },
    {
      id: "invites",
      label: `Pending Invites (${invites.filter((i) => i.status === "pending").length})`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="User Management" subtitle="Manage team members and invitations" />

      {isMockMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Demo mode — changes are temporary and disappear after refresh.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchUsers();
              refetchInvites();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Invite Member
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Members tab */}
      {activeTab === "members" && (
        <>
          {usersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : usersError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-foreground">Failed to load users.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchUsers()}>
                Retry
              </Button>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium text-foreground">No members found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? "Try a different search." : "Invite your first team member."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user: UserView) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {user.full_name
                              .split(" ")
                              .map((w) => w[0])
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{user.full_name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          disabled={changeRole.isPending}
                          className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.department ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            user.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${user.is_active ? "bg-green-500" : "bg-red-500"}`}
                          />
                          {user.is_active ? "Active" : "Deactivated"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {user.is_active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive h-7 text-xs"
                            onClick={() => setConfirmDeactivate(user)}
                            disabled={deactivateUser.isPending}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700 h-7 text-xs"
                            onClick={() => handleReactivate(user)}
                            disabled={reactivateUser.isPending}
                          >
                            Reactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Invites tab */}
      {activeTab === "invites" && (
        <>
          {invitesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : invitesError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-foreground">Failed to load invitations.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchInvites()}>
                Retry
              </Button>
            </div>
          ) : filteredInvites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Mail className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium text-foreground">No invitations</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? "No invites match your search." : "Send an invite to add a team member."}
              </p>
              {!search && (
                <Button size="sm" className="mt-4" onClick={() => setInviteOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Invite Member
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invited By</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvites.map((inv: InvitationView) => {
                    const isExpired = new Date(inv.expires_at) < new Date();
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="text-sm text-foreground">{inv.email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {roleLabel(inv.role)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              inv.status === "accepted"
                                ? "bg-green-100 text-green-700"
                                : inv.status === "cancelled"
                                  ? "bg-gray-200 text-gray-500"
                                  : isExpired
                                    ? "bg-red-100 text-red-700"
                                    : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {inv.status === "pending" && isExpired
                              ? "Expired"
                              : inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.inviter_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(inv.expires_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {inv.status === "pending" && !isExpired && (
                              <>
                                {inv.rawToken && (
                                  <button
                                    title="Copy invite link"
                                    onClick={() => {
                                      const url = `${window.location.origin}/invite/${inv.rawToken}`;
                                      navigator.clipboard
                                        .writeText(url)
                                        .then(() => toast.success("Link copied!"))
                                        .catch(() => toast.info(`Link: ${url}`));
                                    }}
                                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleResendInvite(inv)}
                                  disabled={resendInvite.isPending}
                                >
                                  Resend
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-destructive hover:text-destructive"
                                  onClick={() => handleCancelInvite(inv.id)}
                                  disabled={cancelInvite.isPending}
                                >
                                  Cancel
                                </Button>
                              </>
                            )}
                            {(inv.status === "cancelled" || isExpired) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleResendInvite(inv)}
                                disabled={resendInvite.isPending}
                              >
                                Re-send
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Invite modal */}
      <InviteModal open={inviteOpen} onClose={handleInviteCreated} isMockMode={isMockMode} />

      {/* Deactivate confirmation */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-foreground">Deactivate User</h3>
            <p className="text-sm text-muted-foreground">
              This will deactivate{" "}
              <strong className="text-foreground">{confirmDeactivate.full_name}</strong>. They will
              not be able to access the application until reactivated.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeactivate(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeactivate(confirmDeactivate)}
                disabled={deactivateUser.isPending}
              >
                {deactivateUser.isPending ? "Deactivating…" : "Deactivate"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
