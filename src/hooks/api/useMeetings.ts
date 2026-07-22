/**
 * Meeting React Query hooks — Phase 15A
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  listMeetings,
  getMeeting,
  createMeeting,
  updateMeeting,
  completeMeeting,
  cancelMeeting,
  archiveMeeting,
  listMeetingAttendees,
  listMeetingActions,
  addAttendee,
  removeAttendee,
  addActionItem,
  updateActionItem,
  completeActionItem,
  getMeetingTimeline,
} from "@/services/meeting.service";
import type {
  MeetingFilterInput,
  MeetingCreateInput,
  MeetingUpdateInput,
  AttendeeCreateInput,
  ActionItemCreateInput,
  ActionItemUpdateInput,
  CompleteMeetingInput,
} from "@/types/meeting-view";

export const MEETING_KEYS = {
  all: ["meetings"] as const,
  list: (filters?: MeetingFilterInput) => ["meetings", "list", filters] as const,
  detail: (id: string) => ["meetings", id] as const,
  attendees: (id: string) => ["meetings", id, "attendees"] as const,
  actions: (id: string) => ["meetings", id, "actions"] as const,
  timeline: (id: string) => ["meetings", id, "timeline"] as const,
};

function invalidateMeeting(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: MEETING_KEYS.all });
  if (id) {
    qc.invalidateQueries({ queryKey: MEETING_KEYS.detail(id) });
    qc.invalidateQueries({ queryKey: MEETING_KEYS.attendees(id) });
    qc.invalidateQueries({ queryKey: MEETING_KEYS.actions(id) });
    qc.invalidateQueries({ queryKey: MEETING_KEYS.timeline(id) });
  }
}

export function useMeetings(filters?: MeetingFilterInput) {
  return useInfiniteQuery({
    queryKey: MEETING_KEYS.list(filters),
    queryFn: ({ pageParam }) =>
      listMeetings({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: MEETING_KEYS.detail(id),
    queryFn: () => getMeeting(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useMeetingAttendees(meetingId: string) {
  return useQuery({
    queryKey: MEETING_KEYS.attendees(meetingId),
    queryFn: () => listMeetingAttendees(meetingId),
    select: (r) => r.data ?? [],
    enabled: !!meetingId,
    staleTime: 60_000,
  });
}

export function useMeetingActions(meetingId: string) {
  return useQuery({
    queryKey: MEETING_KEYS.actions(meetingId),
    queryFn: () => listMeetingActions(meetingId),
    select: (r) => r.data ?? [],
    enabled: !!meetingId,
    staleTime: 60_000,
  });
}

export function useMeetingTimeline(meetingId: string) {
  return useQuery({
    queryKey: MEETING_KEYS.timeline(meetingId),
    queryFn: () => getMeetingTimeline(meetingId),
    select: (r) => r.data ?? [],
    enabled: !!meetingId,
    staleTime: 60_000,
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MeetingCreateInput) => createMeeting(input),
    onSuccess: (res) => {
      invalidateMeeting(qc, res.data?.id);
    },
  });
}

export function useUpdateMeeting(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MeetingUpdateInput) => updateMeeting(id, input),
    onSuccess: () => invalidateMeeting(qc, id),
  });
}

export function useCompleteMeeting(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: CompleteMeetingInput) => completeMeeting(id, opts),
    onSuccess: () => invalidateMeeting(qc, id),
  });
}

export function useCancelMeeting(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => cancelMeeting(id, reason),
    onSuccess: () => invalidateMeeting(qc, id),
  });
}

export function useArchiveMeeting(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => archiveMeeting(id),
    onSuccess: () => invalidateMeeting(qc, id),
  });
}

export function useAddAttendee(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AttendeeCreateInput) => addAttendee(meetingId, input),
    onSuccess: () => invalidateMeeting(qc, meetingId),
  });
}

export function useRemoveAttendee(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attendeeId: string) => removeAttendee(attendeeId),
    onSuccess: () => invalidateMeeting(qc, meetingId),
  });
}

export function useAddActionItem(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActionItemCreateInput) => addActionItem(meetingId, input),
    onSuccess: () => invalidateMeeting(qc, meetingId),
  });
}

export function useUpdateMeetingAction(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ActionItemUpdateInput }) =>
      updateActionItem(id, input),
    onSuccess: () => invalidateMeeting(qc, meetingId),
  });
}

export function useCompleteMeetingAction(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) => completeActionItem(actionId),
    onSuccess: () => invalidateMeeting(qc, meetingId),
  });
}
