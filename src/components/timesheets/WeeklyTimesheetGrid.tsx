/**
 * WeeklyTimesheetGrid — Phase 11
 *
 * Renders a project × day grid for a single timesheet week.
 * Cells are clickable to open TimeEntryModal.
 * Shows daily totals, weekend badges, >24h red highlight, overtime indicator.
 * Read-only when timesheet is locked (approved/submitted and role cannot edit).
 */

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimeEntryModal } from "./TimeEntryModal";
import { Plus } from "lucide-react";
import { isWeekend } from "@/types/timesheet-view";
import type { TimesheetView, TimesheetEntryView, TimesheetWorkType } from "@/types/timesheet-view";

interface WeeklyTimesheetGridProps {
  timesheet: TimesheetView;
  entries: TimesheetEntryView[];
  weekDays: string[]; // 7 ISO date strings Mon-Sun
  editable: boolean;
  isBusy?: boolean;
  onAddEntry?: (data: {
    project_id: string;
    entry_date: string;
    hours: number;
    work_type: TimesheetWorkType;
    description?: string;
    billable: boolean;
  }) => Promise<void>;
  onUpdateEntry?: (
    id: string,
    patch: {
      hours?: number;
      description?: string;
      work_type?: TimesheetWorkType;
      billable?: boolean;
    },
  ) => Promise<void>;
  onDeleteEntry?: (id: string) => Promise<void>;
}

export function WeeklyTimesheetGrid({
  timesheet,
  entries,
  weekDays,
  editable,
  isBusy,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
}: WeeklyTimesheetGridProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimesheetEntryView | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build project rows and per-cell data
  const { projectRows, dailyTotals, projectIds } = useMemo(() => {
    const activeEntries = entries.filter((e) => !e.deleted_at);

    // Group by project
    const byProject: Record<string, { name: string; entries: TimesheetEntryView[] }> = {};
    for (const e of activeEntries) {
      if (!byProject[e.project_id]) {
        byProject[e.project_id] = { name: e.project_name, entries: [] };
      }
      byProject[e.project_id].entries.push(e);
    }

    const projectIds = Object.keys(byProject);

    // Daily totals across all projects
    const dailyTotals: Record<string, number> = {};
    for (const day of weekDays) {
      dailyTotals[day] = activeEntries
        .filter((e) => e.entry_date === day)
        .reduce((s, e) => s + e.hours, 0);
    }

    return { projectRows: byProject, dailyTotals, projectIds };
  }, [entries, weekDays]);

  function openAdd(date: string) {
    setSelectedEntry(null);
    setSelectedDate(date);
    setModalOpen(true);
  }

  function openEdit(entry: TimesheetEntryView) {
    setSelectedEntry(entry);
    setSelectedDate(null);
    setModalOpen(true);
  }

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm border-collapse min-w-[700px]">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="sticky left-0 z-10 bg-muted/30 text-left px-3 py-2 font-medium min-w-[160px]">
              Project
            </th>
            {weekDays.map((day, idx) => (
              <th
                key={day}
                className={`px-2 py-2 text-center font-medium min-w-[80px] ${isWeekend(day) ? "text-muted-foreground" : ""}`}
              >
                <div>{DAY_LABELS[idx]}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {new Date(day + "T00:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </th>
            ))}
            <th className="px-3 py-2 text-center font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {projectIds.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center text-muted-foreground py-8">
                No time logged yet.{" "}
                {editable && (
                  <button className="underline text-primary" onClick={() => openAdd(weekDays[0])}>
                    Log your first entry
                  </button>
                )}
              </td>
            </tr>
          )}

          {projectIds.map((projId) => {
            const proj = projectRows[projId];
            const rowTotal = proj.entries.reduce((s, e) => s + e.hours, 0);

            return (
              <tr key={projId} className="border-b hover:bg-muted/20 group">
                <td className="sticky left-0 bg-background group-hover:bg-muted/20 px-3 py-2 font-medium truncate max-w-[180px]">
                  {proj.name}
                </td>
                {weekDays.map((day) => {
                  const dayEntries = proj.entries.filter((e) => e.entry_date === day);
                  const dayHours = dayEntries.reduce((s, e) => s + e.hours, 0);
                  const weekend = isWeekend(day);

                  return (
                    <td
                      key={day}
                      className={`px-1 py-1 text-center align-middle border-l ${weekend ? "bg-muted/20" : ""}`}
                    >
                      {dayEntries.length > 0 ? (
                        <div className="flex flex-col gap-0.5 items-center">
                          {dayEntries.map((e) => (
                            <button
                              key={e.id}
                              onClick={() => editable && openEdit(e)}
                              disabled={!editable}
                              className={`text-xs px-1.5 py-0.5 rounded font-medium w-full ${
                                e.work_type === "overtime"
                                  ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                              } ${!editable ? "cursor-default" : "cursor-pointer"}`}
                            >
                              {e.hours}h
                              {e.is_weekend && (
                                <span className="ml-1 text-[9px] text-orange-500">WE</span>
                              )}
                            </button>
                          ))}
                          {editable && (
                            <button
                              onClick={() => openAdd(day)}
                              className="text-[10px] text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100"
                            >
                              + add
                            </button>
                          )}
                        </div>
                      ) : editable ? (
                        <button
                          onClick={() => openAdd(day)}
                          className={`text-muted-foreground text-xs hover:text-primary transition-opacity opacity-0 group-hover:opacity-100 ${weekend ? "opacity-30" : ""}`}
                        >
                          —
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center font-medium text-sm border-l">
                  {rowTotal > 0 ? `${rowTotal}h` : "—"}
                </td>
              </tr>
            );
          })}

          {/* Daily totals row */}
          <tr className="bg-muted/40 font-medium text-sm border-t-2">
            <td className="sticky left-0 bg-muted/40 px-3 py-2">Daily Total</td>
            {weekDays.map((day) => {
              const total = dailyTotals[day] ?? 0;
              const over = total > 24;
              const weekend = isWeekend(day);
              return (
                <td
                  key={day}
                  className={`px-2 py-2 text-center border-l ${over ? "bg-red-100 text-red-700" : ""} ${weekend ? "text-muted-foreground" : ""}`}
                >
                  {total > 0 ? `${total}h` : "—"}
                  {over && <div className="text-[10px] text-red-500">⚠ over</div>}
                </td>
              );
            })}
            <td className="px-3 py-2 text-center border-l">
              <span className={timesheet.overtime_hours > 0 ? "text-orange-600 font-bold" : ""}>
                {timesheet.total_hours}h
              </span>
              {timesheet.overtime_hours > 0 && (
                <div>
                  <Badge className="bg-orange-100 text-orange-700 text-[10px]">
                    +{timesheet.overtime_hours}h OT
                  </Badge>
                </div>
              )}
            </td>
          </tr>

          {/* Regular / Overtime summary */}
          <tr className="bg-muted/20 text-xs text-muted-foreground">
            <td className="sticky left-0 bg-muted/20 px-3 py-1.5" colSpan={8}>
              Regular: {timesheet.regular_hours}h &nbsp;·&nbsp; Overtime: {timesheet.overtime_hours}
              h
            </td>
            <td />
          </tr>
        </tbody>
      </table>

      {editable && (
        <div className="p-3 border-t">
          <Button variant="outline" size="sm" onClick={() => openAdd(weekDays[0])}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Project Row
          </Button>
        </div>
      )}

      <TimeEntryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        timesheetId={timesheet.id}
        initialEntry={selectedEntry ?? undefined}
        prefillDate={selectedDate ?? undefined}
        weekDays={weekDays}
        onAdd={onAddEntry}
        onUpdate={onUpdateEntry}
        onDelete={onDeleteEntry}
        isBusy={isBusy}
      />
    </div>
  );
}
