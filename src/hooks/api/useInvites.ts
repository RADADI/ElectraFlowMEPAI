/**
 * Invite React Query hooks — Phase 6
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listInvites,
  createInvite,
  cancelInvite,
  resendInvite,
  getInviteByToken,
} from "@/services/invite.service";
import type { InvitationStatus, UserRole } from "@/types/database";

export const INVITE_KEYS = {
  all: ["invites"] as const,
  list: (status?: InvitationStatus) => ["invites", "list", status] as const,
};

export function useInvites(status?: InvitationStatus) {
  return useQuery({
    queryKey: INVITE_KEYS.list(status),
    queryFn: async () => {
      const result = await listInvites(status);
      if (result.error) throw new Error(result.error.message);
      return result;
    },
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

export function useGetInviteByToken(rawToken: string) {
  return useQuery({
    queryKey: ["invite-by-token", rawToken],
    queryFn: async () => {
      const result = await getInviteByToken(rawToken);
      return result;
    },
    enabled: !!rawToken,
    retry: false,
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: UserRole }) => createInvite(email, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVITE_KEYS.all });
    },
  });
}

export function useCancelInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelInvite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVITE_KEYS.all });
    },
  });
}

export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resendInvite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVITE_KEYS.all });
    },
  });
}
