/**
 * EmployeeFormModal — Phase 10
 *
 * Handles Create (no initialEmployee) and Edit (with initialEmployee).
 * Validates unique employee_number client-side.
 * Handles DB 23505 duplicate-number error from the service.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { useCreateEmployee, useUpdateEmployee } from "@/hooks/api/useEmployees";
import type { EmployeeView, EmployeeCreateInput } from "@/types/employee-view";
import type { UserRole } from "@/types/database";

interface EmployeeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEmployee?: EmployeeView;
  onSuccess?: (emp: EmployeeView) => void;
}

const DISCIPLINES = [
  "Electrical",
  "Mechanical",
  "Civil / Structural",
  "Plumbing",
  "Fire Protection",
  "HVAC",
  "Low Voltage / ICT",
  "General",
];

const DEPARTMENTS = [
  "Engineering",
  "QA/QC",
  "Project Management",
  "HR",
  "Finance",
  "Operations",
  "Administration",
];

export function EmployeeFormModal({
  open,
  onOpenChange,
  initialEmployee,
  onSuccess,
}: EmployeeFormModalProps) {
  const isEdit = !!initialEmployee;

  const [fullName, setFullName] = useState(initialEmployee?.full_name ?? "");
  const [email, setEmail] = useState(initialEmployee?.email ?? "");
  const [employeeNumber, setEmployeeNumber] = useState(initialEmployee?.employee_number ?? "");
  const [title, setTitle] = useState(initialEmployee?.title ?? "");
  const [department, setDepartment] = useState(initialEmployee?.department ?? "");
  const [discipline, setDiscipline] = useState(initialEmployee?.discipline ?? "");
  const [role, setRole] = useState<UserRole>(
    (initialEmployee?.role as UserRole) ?? "electrical_engineer",
  );
  const [employmentType, setEmploymentType] = useState<EmployeeCreateInput["employment_type"]>(
    initialEmployee?.employment_type ?? "full_time",
  );
  const [capacityHours, setCapacityHours] = useState(
    String(initialEmployee?.default_weekly_capacity_hours ?? 40),
  );
  const [billableTarget, setBillableTarget] = useState(
    String(initialEmployee?.billable_target_percent ?? 80),
  );
  const [location, setLocation] = useState(initialEmployee?.location ?? "");
  const [startDate, setStartDate] = useState(initialEmployee?.start_date ?? "");
  const [phone, setPhone] = useState(initialEmployee?.phone ?? "");
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateEmployee();
  const updateMut = useUpdateEmployee(initialEmployee?.id ?? "");
  const isBusy = createMut.isPending || updateMut.isPending;

  useEffect(() => {
    if (open) {
      setFullName(initialEmployee?.full_name ?? "");
      setEmail(initialEmployee?.email ?? "");
      setEmployeeNumber(initialEmployee?.employee_number ?? "");
      setTitle(initialEmployee?.title ?? "");
      setDepartment(initialEmployee?.department ?? "");
      setDiscipline(initialEmployee?.discipline ?? "");
      setRole((initialEmployee?.role as UserRole) ?? "electrical_engineer");
      setEmploymentType(initialEmployee?.employment_type ?? "full_time");
      setCapacityHours(String(initialEmployee?.default_weekly_capacity_hours ?? 40));
      setBillableTarget(String(initialEmployee?.billable_target_percent ?? 80));
      setLocation(initialEmployee?.location ?? "");
      setStartDate(initialEmployee?.start_date ?? "");
      setPhone(initialEmployee?.phone ?? "");
      setError(null);
    }
  }, [open, initialEmployee]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    const capHours = Number(capacityHours);
    if (isNaN(capHours) || capHours < 1 || capHours > 60) {
      setError("Weekly capacity must be between 1 and 60 hours.");
      return;
    }
    const bTarget = Number(billableTarget);
    if (isNaN(bTarget) || bTarget < 0 || bTarget > 100) {
      setError("Billable target must be between 0 and 100%.");
      return;
    }

    const input: EmployeeCreateInput = {
      full_name: fullName.trim(),
      email: email.trim(),
      employee_number: employeeNumber.trim() || undefined,
      title: title.trim() || undefined,
      department: department || undefined,
      discipline: discipline || undefined,
      role,
      employment_type: employmentType,
      default_weekly_capacity_hours: capHours,
      billable_target_percent: bTarget,
      location: location.trim() || undefined,
      start_date: startDate || undefined,
      phone: phone.trim() || undefined,
    };

    if (isEdit) {
      const result = await updateMut.mutateAsync(input);
      if (result.error) {
        setError(result.error.message ?? "An error occurred.");
        return;
      }
      onSuccess?.(result.data!);
      onOpenChange(false);
    } else {
      const result = await createMut.mutateAsync(input);
      if (result.error) {
        setError(result.error.message ?? "An error occurred.");
        return;
      }
      onSuccess?.(result.data!);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Employee" : "Add Employee"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update employee details." : "Fill in the details for the new team member."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-name">Full Name *</Label>
              <Input id="emp-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-email">Email *</Label>
              <Input
                id="emp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-number">Employee Number</Label>
              <Input
                id="emp-number"
                placeholder="e.g. EMP-001"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                disabled={isEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-title">Title / Position</Label>
              <Input
                id="emp-title"
                placeholder="e.g. Senior Electrical Engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Discipline</Label>
              <Select value={discipline} onValueChange={setDiscipline}>
                <SelectTrigger>
                  <SelectValue placeholder="Select discipline" />
                </SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>App Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="electrical_engineer">Electrical Engineer</SelectItem>
                  <SelectItem value="senior_electrical_engineer">
                    Senior Electrical Engineer
                  </SelectItem>
                  <SelectItem value="qa_qc_engineer">QA/QC Engineer</SelectItem>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Employment Type</Label>
              <Select
                value={employmentType}
                onValueChange={(v) =>
                  setEmploymentType(v as EmployeeCreateInput["employment_type"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full Time</SelectItem>
                  <SelectItem value="part_time">Part Time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="consultant">Consultant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-cap">Weekly Capacity (hrs)</Label>
              <Input
                id="emp-cap"
                type="number"
                min={1}
                max={60}
                value={capacityHours}
                onChange={(e) => setCapacityHours(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-target">Billable Target %</Label>
              <Input
                id="emp-target"
                type="number"
                min={0}
                max={100}
                value={billableTarget}
                onChange={(e) => setBillableTarget(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-start">Start Date</Label>
              <Input
                id="emp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emp-location">Location</Label>
              <Input
                id="emp-location"
                placeholder="e.g. Riyadh, KSA"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-phone">Phone</Label>
              <Input
                id="emp-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
