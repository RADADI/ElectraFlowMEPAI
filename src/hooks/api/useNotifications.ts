/**
 * React Query hooks for Phase 13: Notifications & Activity
 *
 * Realtime strategy:
 *   useRealtimeNotifications — subscribes to INSERT on `notifications` table
 *     (filter: recipient_profile_id = <current profile>)
 *   useRealtimeActivity — subscribes to INSERT on `activity_events` table
 *     (filter: organization_id = <current org>)
 *
 *   Both hooks call refreshRealtimeAuth() before subscribing to ensure the
 *   WebSocket carries the Clerk JWT for RLS. They do NOT modify auth-context.
 *
 * On refresh:     React Query re-fetches from DB; realtime re-subscribes in useEffect.
 * On logout:      useEffect cleanup removes channels; cache cleared by query invalidation.
 * No data:        infinite query returns empty pages; bell shows no badge.
 * Bad cursor:     decodeCursor returns null → falls back to first page silently.
 * Network fail:   React Query retries 3x; error state surfaced to UI.
 * Role change:    RLS re-evaluates on next query; stale cache cleared via invalidateQueries.
 * Record deleted: notification still exists (soft-delete); route may 404 — handled by target page.
 * Mobile:         dropdowns use max-w and overflow-y-auto; tested via CSS only.
 */

import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase, IS_SUPABASE_CONFIGURED, refreshRealtimeAuth } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  snoozeNotification,
  pinNotification,
  listPreferences,
  upsertPreference,
  type ListNotificationOptions,
} from "@/services/notification.service";
import { listActivityEvents, type ListActivityOptions } from "@/services/activity.service";
import type { NotificationFrequency } from "@/types/database";

// ─── Query key factory ────────────────────────────────────────────────────────

export const NOTIFICATION_KEYS = {
  all: ["notifications"] as const,
  list: (opts?: ListNotificationOptions) => ["notifications", "list", opts] as const,
  unreadCount: () => ["notifications", "unread_count"] as const,
  preferences: () => ["notification_preferences"] as const,
  activity: (opts?: ListActivityOptions) => ["activity_events", opts] as const,
};

// ─── Bell unread count ────────────────────────────────────────────────────────

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.unreadCount(),
    queryFn: () => getUnreadCount(),
    select: (r) => r.data ?? 0,
    staleTime: 30_000,
    refetchInterval: 60_000, // poll fallback when realtime is unavailable
  });
}

// ─── Bell dropdown: latest 10 notifications ───────────────────────────────────

export function useLatestNotifications() {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.list({ limit: 10 }),
    queryFn: () => listNotifications({ limit: 10 }),
    select: (r) => r.data?.items ?? [],
    staleTime: 30_000,
  });
}

// ─── Full paginated list ──────────────────────────────────────────────────────

export function useNotifications(opts: Omit<ListNotificationOptions, "cursor"> = {}) {
  return useInfiniteQuery({
    queryKey: NOTIFICATION_KEYS.list(opts),
    queryFn: ({ pageParam }) =>
      listNotifications({ ...opts, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.data?.next_cursor ?? undefined,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      items: data.pages.flatMap((p) => p.data?.items ?? []),
      isMockData: data.pages[0]?.isMockData ?? false,
    }),
    staleTime: 30_000,
  });
}

// ─── Activity feed ────────────────────────────────────────────────────────────

export function useActivityEvents(opts: Omit<ListActivityOptions, "cursor"> = {}) {
  return useInfiniteQuery({
    queryKey: NOTIFICATION_KEYS.activity(opts),
    queryFn: ({ pageParam }) =>
      listActivityEvents({ ...opts, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.data?.next_cursor ?? undefined,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      items: data.pages.flatMap((p) => p.data?.items ?? []),
      isMockData: data.pages[0]?.isMockData ?? false,
    }),
    staleTime: 30_000,
  });
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export function useNotificationPreferences() {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.preferences(),
    queryFn: () => listPreferences(),
    select: (r) => ({ prefs: r.data ?? [], isMockData: r.isMockData }),
    staleTime: 60_000,
  });
}

export function useUpsertPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventType,
      channel,
      updates,
    }: {
      eventType: string;
      channel: "in_app" | "email" | "future_webhook";
      updates: { enabled?: boolean; frequency?: NotificationFrequency };
    }) => upsertPreference(eventType, channel, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.preferences() });
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markAsRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllAsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}

export function useSnoozeNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string | null }) =>
      snoozeNotification(id, until),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}

export function usePinNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => pinNotification(id, pinned),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}

// ─── Realtime: notifications ──────────────────────────────────────────────────

/**
 * Subscribes to new notifications for the current profile via Supabase Realtime.
 * Invalidates the query cache on INSERT so the bell updates without polling.
 * No-op in mock mode.
 *
 * On refresh: hook re-mounts → new subscription established.
 * On logout:  cleanup function removes the channel automatically.
 */
export function useRealtimeNotifications() {
  const qc = useQueryClient();
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  useEffect(() => {
    if (!IS_SUPABASE_CONFIGURED || !supabase) return;

    const { userId } = getSessionContext();
    if (!userId) return;

    let cancelled = false;

    (async () => {
      await refreshRealtimeAuth();
      if (cancelled || !supabase) return;

      // Fetch the profile ID to build the row-level filter
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();

      const profileId = (profileRow as { id: string } | null)?.id;
      if (!profileId || cancelled || !supabase) return;

      const channel = supabase
        .channel(`notif-${profileId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_profile_id=eq.${profileId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.unreadCount() });
            qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.list({ limit: 10 }) });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `recipient_profile_id=eq.${profileId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
          },
        )
        .subscribe();

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ─── Realtime: activity events ────────────────────────────────────────────────

/**
 * Subscribes to new activity events for the current org via Supabase Realtime.
 * Invalidates activity query cache on INSERT.
 * No-op in mock mode.
 */
export function useRealtimeActivity() {
  const qc = useQueryClient();
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  useEffect(() => {
    if (!IS_SUPABASE_CONFIGURED || !supabase) return;

    const { organizationId } = getSessionContext();
    if (!organizationId) return;

    let cancelled = false;

    (async () => {
      await refreshRealtimeAuth();
      if (cancelled || !supabase) return;

      const channel = supabase
        .channel(`activity-org-${organizationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "activity_events",
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.activity() });
          },
        )
        .subscribe();

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
