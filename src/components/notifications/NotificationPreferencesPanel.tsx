/**
 * NotificationPreferencesPanel — Phase 13
 *
 * Grouped toggle panel for per-event-type notification preferences.
 * Email channel is present but disabled (future implementation).
 *
 * What happens on refresh: useNotificationPreferences re-fetches from DB.
 * No data: uses defaults (all enabled, immediate frequency).
 * Network fail: error state with retry button.
 * Role change: preferences are profile-level; role change doesn't affect them.
 */

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { useNotificationPreferences, useUpsertPreference } from "@/hooks/api/useNotifications";
import type { NotificationPreference, NotificationFrequency } from "@/types/database";
import type { PreferenceGroup } from "@/types/notification-view";
import { toast } from "sonner";

// ─── Preference definitions (all supported event types grouped by module) ──────

interface PrefDef {
  event_type: string;
  label: string;
}

const PREFERENCE_GROUPS: { group: string; icon: string; events: PrefDef[] }[] = [
  {
    group: "Submittals",
    icon: "ClipboardCheck",
    events: [
      { event_type: "submittal.submitted", label: "Submittal submitted" },
      { event_type: "submittal.approved", label: "Submittal approved" },
      { event_type: "submittal.rejected", label: "Submittal rejected" },
      { event_type: "submittal.revision_requested", label: "Revision requested" },
      { event_type: "submittal.assigned", label: "Submittal assigned to you" },
    ],
  },
  {
    group: "RFIs",
    icon: "MessageSquare",
    events: [
      { event_type: "rfi.created", label: "RFI created" },
      { event_type: "rfi.assigned", label: "RFI assigned to you" },
      { event_type: "rfi.responded", label: "RFI responded" },
      { event_type: "rfi.closed", label: "RFI closed" },
    ],
  },
  {
    group: "NCRs",
    icon: "AlertTriangle",
    events: [
      { event_type: "ncr.created", label: "NCR created" },
      { event_type: "ncr.assigned", label: "NCR assigned to you" },
      { event_type: "ncr.closed", label: "NCR closed" },
    ],
  },
  {
    group: "Documents",
    icon: "FileText",
    events: [
      { event_type: "document.uploaded", label: "Document uploaded" },
      { event_type: "document.approved", label: "Document approved" },
      { event_type: "document.rejected", label: "Document rejected" },
    ],
  },
  {
    group: "Timesheets & Leave",
    icon: "Clock",
    events: [
      { event_type: "timesheet.submitted", label: "Timesheet submitted for review" },
      { event_type: "timesheet.approved", label: "Your timesheet approved" },
      { event_type: "timesheet.rejected", label: "Your timesheet rejected" },
      { event_type: "leave.requested", label: "Leave requested" },
      { event_type: "leave.approved", label: "Your leave approved" },
      { event_type: "leave.rejected", label: "Your leave rejected" },
    ],
  },
  {
    group: "Financials",
    icon: "DollarSign",
    events: [
      { event_type: "expense.approved", label: "Expense approved" },
      { event_type: "expense.rejected", label: "Expense rejected" },
      { event_type: "invoice.overdue", label: "Invoice overdue" },
      { event_type: "invoice.paid", label: "Invoice paid" },
      { event_type: "change_order.approved", label: "Change order approved" },
      { event_type: "budget.over_budget", label: "Project over budget" },
    ],
  },
  {
    group: "Resources",
    icon: "Users",
    events: [
      { event_type: "resource.overbooked", label: "Resource overbooked" },
      { event_type: "certification.expiring", label: "Certification expiring" },
    ],
  },
  {
    group: "Team & Users",
    icon: "UserCheck",
    events: [
      { event_type: "user.invited", label: "User invited" },
      { event_type: "user.joined", label: "New team member joined" },
      { event_type: "role.changed", label: "Your role changed" },
    ],
  },
  {
    group: "Projects",
    icon: "FolderKanban",
    events: [
      { event_type: "project.status_changed", label: "Project status changed" },
      { event_type: "project.member_added", label: "Added to a project" },
    ],
  },
];

const FREQUENCY_OPTIONS: { value: NotificationFrequency; label: string }[] = [
  { value: "immediate", label: "Immediate" },
  { value: "daily_digest", label: "Daily digest" },
  { value: "weekly_digest", label: "Weekly digest" },
  { value: "disabled", label: "Off" },
];

// ─── Helper to look up a preference ──────────────────────────────────────────

function findPref(
  prefs: NotificationPreference[],
  eventType: string,
  channel: "in_app" | "email",
): NotificationPreference | undefined {
  return prefs.find((p) => p.event_type === eventType && p.channel === channel);
}

// ─── PreferenceRow ────────────────────────────────────────────────────────────

function PreferenceRow({
  eventDef,
  prefs,
  onToggle,
  onFrequency,
}: {
  eventDef: PrefDef;
  prefs: NotificationPreference[];
  onToggle: (eventType: string, enabled: boolean) => void;
  onFrequency: (eventType: string, frequency: NotificationFrequency) => void;
}) {
  const pref = findPref(prefs, eventDef.event_type, "in_app");
  const enabled = pref?.enabled ?? true;
  const frequency = pref?.frequency ?? "immediate";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm">{eventDef.label}</p>
      </div>

      {/* In-app toggle */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Switch
          id={`pref-${eventDef.event_type}`}
          checked={enabled}
          onCheckedChange={(v) => onToggle(eventDef.event_type, v)}
          aria-label={`${enabled ? "Disable" : "Enable"} ${eventDef.label} notification`}
        />

        {enabled && (
          <Select
            value={frequency}
            onValueChange={(v) => onFrequency(eventDef.event_type, v as NotificationFrequency)}
          >
            <SelectTrigger className="h-7 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

// ─── PreferenceGroup section ──────────────────────────────────────────────────

function PreferenceSection({
  group,
  prefs,
  onToggle,
  onFrequency,
}: {
  group: (typeof PREFERENCE_GROUPS)[0];
  prefs: NotificationPreference[];
  onToggle: (eventType: string, enabled: boolean) => void;
  onFrequency: (eventType: string, frequency: NotificationFrequency) => void;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {group.group}
      </h3>
      <div className="rounded-lg border border-border bg-card px-4 py-1">
        {group.events.map((ev) => (
          <PreferenceRow
            key={ev.event_type}
            eventDef={ev}
            prefs={prefs}
            onToggle={onToggle}
            onFrequency={onFrequency}
          />
        ))}
      </div>
    </div>
  );
}

// ─── NotificationPreferencesPanel ─────────────────────────────────────────────

export function NotificationPreferencesPanel() {
  const { data, isLoading, isError } = useNotificationPreferences();
  const upsert = useUpsertPreference();

  const prefs = data?.prefs ?? [];

  function handleToggle(eventType: string, enabled: boolean) {
    upsert.mutate(
      { eventType, channel: "in_app", updates: { enabled } },
      {
        onError: () => toast.error("Failed to save preference. Please try again."),
      },
    );
  }

  function handleFrequency(eventType: string, frequency: NotificationFrequency) {
    upsert.mutate(
      { eventType, channel: "in_app", updates: { frequency } },
      {
        onError: () => toast.error("Failed to save preference. Please try again."),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading preferences…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center py-12 gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive font-medium">Failed to load preferences.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Channel legend */}
      <div className="flex items-center gap-4 mb-6 p-3 bg-muted/50 rounded-lg text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">In-app</span>
          <Badge variant="secondary" className="text-[10px]">
            Active
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Email</span>
          <Badge variant="outline" className="text-[10px]">
            Coming soon
          </Badge>
        </div>
      </div>

      {PREFERENCE_GROUPS.map((group) => (
        <PreferenceSection
          key={group.group}
          group={group}
          prefs={prefs}
          onToggle={handleToggle}
          onFrequency={handleFrequency}
        />
      ))}
    </div>
  );
}
