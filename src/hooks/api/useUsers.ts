/**
 * User management React Query hooks — Phase 6
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listUsers, changeRole, deactivateUser, reactivateUser } from "@/services/user.service";
import type { UserRole } from "@/types/database";

export const USER_KEYS = {
  all: ["users"] as const,
  list: () => ["users", "list"] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: USER_KEYS.list(),
    queryFn: async () => {
      const result = await listUsers();
      if (result.error) throw new Error(result.error.message);
      return result;
    },
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

export function useChangeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, newRole }: { profileId: string; newRole: UserRole }) =>
      changeRole(profileId, newRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USER_KEYS.all });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => deactivateUser(profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USER_KEYS.all });
    },
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => reactivateUser(profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USER_KEYS.all });
    },
  });
}
