import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/auth-context";
import {
  useEmployee,
  useDeactivateEmployee,
  useReactivateEmployee,
  useEmployeeSkills,
  useAddSkill,
  useRemoveSkill,
  useEmployeeCertifications,
  useAddCertification,
  useRemoveCertification,
  useResourceAllocations,
  useArchiveAllocation,
} from "@/hooks/api/useEmployees";
import { EmployeeFormModal } from "@/components/resources/EmployeeFormModal";
import { AllocationModal } from "@/components/resources/AllocationModal";
import {
  User,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  AlertTriangle,
  CheckCircle,
  Clock,
  Archive,
  UserCheck,
  UserX,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { getCertBadge } from "@/types/employee-view";
import type { EmployeeCertificationView, AllocationView } from "@/types/employee-view";
import type { SkillCreateInput, CertificationCreateInput } from "@/types/employee-view";

export const Route = createFileRoute("/_app/resources/$id")({
  head: () => ({ meta: [{ title: "Employee Detail — ElectraFlow AI" }] }),
  component: EmployeeDetail,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function certBadgeEl(cert: EmployeeCertificationView) {
  switch (cert.cert_badge) {
    case "expired":
      return (
        <Badge variant="destructive" className="text-xs">
          Expired
        </Badge>
      );
    case "expiring_7d":
      return <Badge className="bg-red-100 text-red-700 text-xs">Expiring in 7 days</Badge>;
    case "expiring_30d":
      return <Badge className="bg-yellow-100 text-yellow-700 text-xs">Expiring in 30 days</Badge>;
    default:
      return <Badge className="bg-green-100 text-green-700 text-xs">Healthy</Badge>;
  }
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

function EmployeeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = (role ?? "").toLowerCase() === "admin";
  const isHR = (role ?? "").toLowerCase() === "hr";
  const isAdminOrHR = isAdmin || isHR;
  const canAllocate = isAdmin || isHR || (role ?? "").toLowerCase() === "project_manager";

  const empQuery = useEmployee(id);
  const emp = empQuery.data?.data ?? null;
  const isMock = empQuery.data?.isMockData ?? false;

  const skillsQuery = useEmployeeSkills(id);
  const skills = skillsQuery.data ?? [];

  const certsQuery = useEmployeeCertifications(id);
  const certs = certsQuery.data ?? [];

  const allocsQuery = useResourceAllocations(id);
  const allocs = allocsQuery.data ?? [];

  const deactivateMut = useDeactivateEmployee(id);
  const reactivateMut = useReactivateEmployee(id);
  const addSkillMut = useAddSkill(id);
  const removeSkillMut = useRemoveSkill(id);
  const addCertMut = useAddCertification(id);
  const removeCertMut = useRemoveCertification(id);
  const archiveAllocMut = useArchiveAllocation(id);

  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [editAlloc, setEditAlloc] = useState<AllocationView | null>(null);
  const [endAllocTarget, setEndAllocTarget] = useState<AllocationView | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Skill form state
  const [skillName, setSkillName] = useState("");
  const [skillCategory, setSkillCategory] = useState("");
  const [skillLevel, setSkillLevel] =
    useState<SkillCreateInput["proficiency_level"]>("intermediate");
  const [skillYears, setSkillYears] = useState("");
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);

  // Cert form state
  const [showCertForm, setShowCertForm] = useState(false);
  const [certName, setCertName] = useState("");
  const [certBody, setCertBody] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [certIssue, setCertIssue] = useState("");
  const [certExpiry, setCertExpiry] = useState("");
  const [certError, setCertError] = useState<string | null>(null);

  async function handleDeactivate() {
    const result = await deactivateMut.mutateAsync();
    setDeactivateOpen(false);
    if (result.error) {
      setActionMsg(`Error: ${result.error.message}`);
    } else {
      const warning = (result.data as { warning?: string }).warning;
      setActionMsg(warning ?? "Employee deactivated.");
    }
  }

  async function handleReactivate() {
    const result = await reactivateMut.mutateAsync();
    setReactivateOpen(false);
    if (result.error) {
      setActionMsg(`Error: ${result.error.message}`);
    } else {
      setActionMsg("Employee reactivated.");
    }
  }

  async function handleAddSkill(e: React.FormEvent) {
    e.preventDefault();
    setSkillError(null);
    if (!skillName.trim()) {
      setSkillError("Skill name is required.");
      return;
    }
    const input: SkillCreateInput = {
      skill_name: skillName.trim(),
      skill_category: skillCategory.trim() || undefined,
      proficiency_level: skillLevel,
      years_experience: skillYears ? Number(skillYears) : undefined,
    };
    const result = await addSkillMut.mutateAsync(input);
    if (result.error) {
      setSkillError(result.error.message ?? "Error adding skill.");
      return;
    }
    setSkillName("");
    setSkillCategory("");
    setSkillLevel("intermediate");
    setSkillYears("");
    setShowSkillForm(false);
  }

  async function handleAddCert(e: React.FormEvent) {
    e.preventDefault();
    setCertError(null);
    if (!certName.trim()) {
      setCertError("Certification name is required.");
      return;
    }
    const input: CertificationCreateInput = {
      certification_name: certName.trim(),
      issuing_body: certBody.trim() || undefined,
      certification_number: certNumber.trim() || undefined,
      issue_date: certIssue || undefined,
      expiry_date: certExpiry || undefined,
    };
    const result = await addCertMut.mutateAsync(input);
    if (result.error) {
      setCertError(result.error.message ?? "Error adding certification.");
      return;
    }
    setCertName("");
    setCertBody("");
    setCertNumber("");
    setCertIssue("");
    setCertExpiry("");
    setShowCertForm(false);
  }

  async function handleEndAlloc() {
    if (!endAllocTarget) return;
    const result = await archiveAllocMut.mutateAsync(endAllocTarget.id);
    setEndAllocTarget(null);
    if (result.error) {
      setActionMsg(`Error: ${result.error.message}`);
    } else {
      setActionMsg("Allocation ended.");
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (empQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // ─── Not found ──────────────────────────────────────────────────────────────
  if (empQuery.isError || !emp) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <User className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Employee Not Found</h2>
        <p className="text-muted-foreground text-sm">
          This employee does not exist or you do not have access.
        </p>
        <Button asChild variant="outline">
          <Link to="/resources">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Resources
          </Link>
        </Button>
      </div>
    );
  }

  const expiredCerts = certs.filter((c) => getCertBadge(c.expiry_date) === "expired").length;
  const soonCerts = certs.filter((c) => {
    const b = getCertBadge(c.expiry_date);
    return b === "expiring_7d" || b === "expiring_30d";
  }).length;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/resources">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Resources
          </Link>
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{emp.full_name}</span>
      </div>

      {isMock && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertDescription className="text-yellow-700 text-sm">
            Demo mode — changes are temporary and disappear after refresh.
          </AlertDescription>
        </Alert>
      )}

      {actionMsg && (
        <Alert>
          <AlertDescription className="flex items-center justify-between">
            <span>{actionMsg}</span>
            <Button size="sm" variant="ghost" onClick={() => setActionMsg(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!emp.is_active && (
        <Alert variant="destructive">
          <UserX className="h-4 w-4" />
          <AlertDescription>
            This employee is inactive and cannot be assigned to new projects.
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        title={emp.full_name}
        subtitle={[emp.title, emp.department, emp.discipline].filter(Boolean).join(" · ")}
        actions={
          isAdminOrHR ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
              {emp.is_active ? (
                <Button
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive/10"
                  onClick={() => setDeactivateOpen(true)}
                >
                  <UserX className="mr-2 h-4 w-4" />
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="text-green-600 border-green-300 hover:bg-green-50"
                  onClick={() => setReactivateOpen(true)}
                >
                  <UserCheck className="mr-2 h-4 w-4" />
                  Reactivate
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-5 space-y-2 text-sm">
            {emp.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>{emp.email}</span>
              </div>
            )}
            {emp.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>{emp.phone}</span>
              </div>
            )}
            {emp.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span>{emp.location}</span>
              </div>
            )}
            {emp.manager_name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>
                  Reports to:{" "}
                  <span
                    className={emp.manager_name === "Former Manager" ? "italic text-gray-400" : ""}
                  >
                    {emp.manager_name}
                  </span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Employee #</span>
              <span className="font-medium">{emp.employee_number ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Employment</span>
              <span className="font-medium capitalize">
                {emp.employment_type.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start Date</span>
              <span>{formatDate(emp.start_date ?? emp.hire_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Weekly Capacity</span>
              <span>{emp.default_weekly_capacity_hours}h</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Utilization</span>
              <span
                className={`text-lg font-bold ${emp.current_utilization_percent > 100 ? "text-red-600" : emp.current_utilization_percent >= 80 ? "text-green-600" : "text-yellow-600"}`}
              >
                {emp.current_utilization_percent}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Target</span>
              <span className="text-sm font-medium">{emp.billable_target_percent ?? 80}%</span>
            </div>
            {expiredCerts > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                {expiredCerts} expired certification{expiredCerts > 1 ? "s" : ""}
              </div>
            )}
            {soonCerts > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-600">
                <Clock className="h-3.5 w-3.5" />
                {soonCerts} certification{soonCerts > 1 ? "s" : ""} expiring soon
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="allocations">
        <TabsList>
          <TabsTrigger value="allocations">Allocations</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="certifications">Certifications</TabsTrigger>
        </TabsList>

        {/* Allocations tab */}
        <TabsContent value="allocations" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Project Allocations</h3>
            {canAllocate && emp.is_active && (
              <Button size="sm" onClick={() => setAllocModalOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Allocation
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Allocation</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    {canAllocate && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ) : allocs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={canAllocate ? 6 : 5}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No allocations yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    allocs.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{a.project_name}</span>
                            {a.project_archived && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-orange-300 text-orange-600"
                              >
                                <Archive className="mr-0.5 h-2.5 w-2.5" />
                                Archived Project
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {a.role_on_project ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${a.allocation_percent > 100 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}
                          >
                            {a.allocation_percent}%
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(a.start_date)} →{" "}
                          {a.end_date ? formatDate(a.end_date) : "Ongoing"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              a.status === "active"
                                ? "border-green-200 text-green-700"
                                : a.status === "ended"
                                  ? "border-gray-200 text-gray-500"
                                  : "border-yellow-200 text-yellow-700"
                            }
                          >
                            {a.status}
                          </Badge>
                        </TableCell>
                        {canAllocate && (
                          <TableCell className="text-right">
                            {a.status !== "ended" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive text-xs"
                                onClick={() => setEndAllocTarget(a)}
                                disabled={archiveAllocMut.isPending}
                              >
                                {archiveAllocMut.isPending && endAllocTarget?.id === a.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "End"
                                )}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Skills tab */}
        <TabsContent value="skills" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Skills Matrix</h3>
            {isAdminOrHR && (
              <Button size="sm" variant="outline" onClick={() => setShowSkillForm((v) => !v)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Skill
              </Button>
            )}
          </div>

          {showSkillForm && isAdminOrHR && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">New Skill</CardTitle>
              </CardHeader>
              <CardContent>
                {skillError && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertDescription>{skillError}</AlertDescription>
                  </Alert>
                )}
                <form onSubmit={handleAddSkill} className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Skill Name *</Label>
                    <Input
                      value={skillName}
                      onChange={(e) => setSkillName(e.target.value)}
                      placeholder="e.g. ETAP"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Input
                      value={skillCategory}
                      onChange={(e) => setSkillCategory(e.target.value)}
                      placeholder="e.g. Software"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Proficiency</Label>
                    <Select
                      value={skillLevel}
                      onValueChange={(v) =>
                        setSkillLevel(v as SkillCreateInput["proficiency_level"])
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Years Experience</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Optional"
                      value={skillYears}
                      onChange={(e) => setSkillYears(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSkillForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={addSkillMut.isPending}>
                      {addSkillMut.isPending && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}
                      Add
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Skill</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Proficiency</TableHead>
                    <TableHead>Experience</TableHead>
                    {isAdminOrHR && <TableHead className="text-right" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skills.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={isAdminOrHR ? 5 : 4}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No skills recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    skills.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.skill_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.skill_category ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {s.proficiency_level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.years_experience != null
                            ? `${s.years_experience} yr${s.years_experience !== 1 ? "s" : ""}`
                            : "—"}
                        </TableCell>
                        {isAdminOrHR && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removeSkillMut.mutate(s.id)}
                              disabled={removeSkillMut.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Certifications tab */}
        <TabsContent value="certifications" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Professional Certifications</h3>
            {isAdminOrHR && (
              <Button size="sm" variant="outline" onClick={() => setShowCertForm((v) => !v)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Certification
              </Button>
            )}
          </div>

          {showCertForm && isAdminOrHR && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">New Certification</CardTitle>
              </CardHeader>
              <CardContent>
                {certError && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertDescription>{certError}</AlertDescription>
                  </Alert>
                )}
                <form onSubmit={handleAddCert} className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label>Certification Name *</Label>
                    <Input
                      value={certName}
                      onChange={(e) => setCertName(e.target.value)}
                      placeholder="e.g. PE License"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Issuing Body</Label>
                    <Input
                      value={certBody}
                      onChange={(e) => setCertBody(e.target.value)}
                      placeholder="e.g. NCEES"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Certification Number</Label>
                    <Input value={certNumber} onChange={(e) => setCertNumber(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Issue Date</Label>
                    <Input
                      type="date"
                      value={certIssue}
                      onChange={(e) => setCertIssue(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Expiry Date</Label>
                    <Input
                      type="date"
                      value={certExpiry}
                      onChange={(e) => setCertExpiry(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCertForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={addCertMut.isPending}>
                      {addCertMut.isPending && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}
                      Add
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Issuing Body</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdminOrHR && <TableHead className="text-right" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={isAdminOrHR ? 6 : 5}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No certifications recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    certs.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.certification_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.issuing_body ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.certification_number ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(c.expiry_date)}</TableCell>
                        <TableCell>{certBadgeEl(c)}</TableCell>
                        {isAdminOrHR && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removeCertMut.mutate(c.id)}
                              disabled={removeCertMut.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <EmployeeFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        initialEmployee={emp}
        onSuccess={() => setEditOpen(false)}
      />

      <AllocationModal
        open={allocModalOpen || !!editAlloc}
        onOpenChange={(v) => {
          if (!v) {
            setAllocModalOpen(false);
            setEditAlloc(null);
          }
        }}
        employeeId={emp.id}
        employeeName={emp.full_name}
        initialAllocation={editAlloc ?? undefined}
        onSuccess={() => {
          setAllocModalOpen(false);
          setEditAlloc(null);
        }}
      />

      {/* Deactivate confirm */}
      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {emp.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This employee will be marked as inactive. Active allocations remain but won't count in
              capacity planning.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivateMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Deactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate confirm */}
      <AlertDialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate {emp.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Employee will be marked as active with status set to Active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReactivate}>
              {reactivateMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Reactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* End allocation confirm */}
      <AlertDialog open={!!endAllocTarget} onOpenChange={(v) => !v && setEndAllocTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Allocation?</AlertDialogTitle>
            <AlertDialogDescription>
              The allocation to <strong>{endAllocTarget?.project_name}</strong> will be ended. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndAlloc}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              End Allocation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
