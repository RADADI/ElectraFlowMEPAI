import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { employees } from "@/lib/dummy-data";
import {
  Users,
  GraduationCap,
  BadgeCheck,
  CalendarDays,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  useHolidays,
  useCreateHoliday,
  useUpdateHoliday,
  useArchiveHoliday,
} from "@/hooks/api/useHolidays";
import type { HolidayView } from "@/types/timesheet-view";

export const Route = createFileRoute("/_app/hr")({
  head: () => ({ meta: [{ title: "HR Dashboard — ElectraFlow AI" }] }),
  component: () => (
    <RoleGuard allowedRoles={["Admin", "HR"]}>
      <HR />
    </RoleGuard>
  ),
});

const skills = [
  "AutoCAD",
  "Revit",
  "ETAP",
  "SKM",
  "Bluebeam",
  "Power BI",
  "Python",
  "AI Tools",
] as const;

function Dot({ level }: { level: number }) {
  const color =
    level >= 4 ? "bg-success" : level >= 3 ? "bg-info" : level >= 2 ? "bg-warning" : "bg-muted";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i <= level ? color : "bg-border"}`} />
      ))}
    </div>
  );
}

function HR() {
  return (
    <>
      <PageHeader
        title="HR Dashboard"
        subtitle="Employees, skills, certifications, training and attendance."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Employees" value={148} icon={Users} />
        <StatCard label="Certifications" value={62} icon={BadgeCheck} intent="success" />
        <StatCard label="Trainings (YTD)" value={34} icon={GraduationCap} intent="info" />
        <StatCard label="Avg Attendance" value="96%" icon={CalendarDays} intent="success" />
      </div>

      <Tabs defaultValue="skills" className="space-y-4">
        <TabsList>
          <TabsTrigger value="skills">Skills Matrix</TabsTrigger>
          <TabsTrigger value="holidays">Public Holidays</TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-3 font-medium">Engineer</TableHead>
                    <TableHead className="px-3 font-medium">Role</TableHead>
                    {skills.map((s) => (
                      <TableHead key={s} className="px-3 font-medium text-center">
                        {s}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="px-3 font-medium whitespace-nowrap">{e.name}</TableCell>
                      <TableCell className="px-3 text-xs text-muted-foreground">{e.role}</TableCell>
                      {skills.map((s) => (
                        <TableCell key={s} className="px-3">
                          <div className="flex justify-center">
                            <Dot level={(e.skills as Record<string, number>)[s] ?? 0} />
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Trainings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { t: "Revit MEP Advanced", who: "8 engineers", date: "Jun 18" },
                  { t: "NFPA 13 Sprinkler Design", who: "5 engineers", date: "Jun 10" },
                  { t: "Power BI for PMs", who: "12 staff", date: "May 28" },
                ].map((x, i) => (
                  <div key={i} className="flex justify-between p-2 rounded-md border">
                    <span>
                      {x.t}
                      <div className="text-xs text-muted-foreground">{x.who}</div>
                    </span>
                    <Badge variant="outline">{x.date}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance Highlights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { n: "Sara Khan", s: "Top reviewer this quarter — 142 items" },
                  { n: "John Doe", s: "Completed 3 major design packages on time" },
                  { n: "Priya Shah", s: "Mentored 4 junior engineers" },
                ].map((x, i) => (
                  <div key={i} className="p-2 rounded-md border">
                    <div className="font-medium">{x.n}</div>
                    <div className="text-xs text-muted-foreground">{x.s}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="holidays">
          <HolidaysPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

function HolidaysPanel() {
  const holidaysQuery = useHolidays();
  const createMut = useCreateHoliday();
  const archiveMut = useArchiveHoliday();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const holidays = holidaysQuery.data ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!date) {
      setFormError("Date is required.");
      return;
    }
    const result = await createMut.mutateAsync({
      name: name.trim(),
      holiday_date: date,
      recurring,
    });
    if (result.error) {
      setFormError(result.error.message ?? "Failed to create holiday.");
      return;
    }
    setOpen(false);
    setName("");
    setDate("");
    setRecurring(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Holidays are excluded from leave day calculations.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Holiday
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Recurring</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidaysQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!holidaysQuery.isLoading && holidays.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No holidays configured.
                  </TableCell>
                </TableRow>
              )}
              {holidays.map((h: HolidayView) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">
                    {new Date(h.holiday_date + "T00:00:00").toLocaleDateString(undefined, {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell>{h.name}</TableCell>
                  <TableCell>
                    {h.recurring ? (
                      <Badge className="bg-blue-50 text-blue-700 text-xs">Annual</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        One-off
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => archiveMut.mutate(h.id)}
                      disabled={archiveMut.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Add Public Holiday</DialogTitle>
            <DialogDescription>
              This date will be excluded from all leave day calculations.
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hol-name">Holiday Name *</Label>
              <Input
                id="hol-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Saudi National Day"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hol-date">Date *</Label>
              <Input
                id="hol-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hol-recurring"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="hol-recurring" className="cursor-pointer">
                Recurring annually
              </Label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createMut.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Add Holiday
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
