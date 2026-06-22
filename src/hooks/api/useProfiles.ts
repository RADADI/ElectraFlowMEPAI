import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentProfile, listProfiles, updateProfile } from "@/services/profile.service";
import type { ProfileUpdate } from "@/types/database";

export const PROFILE_KEYS = {
  current: ["profile", "me"] as const,
  all: ["profiles"] as const,
  detail: (id: string) => ["profiles", id] as const,
};

export function useCurrentProfile() {
  return useQuery({
    queryKey: PROFILE_KEYS.current,
    queryFn: () => getCurrentProfile(),
    select: (result) => result.data ?? null,
    staleTime: 60_000,
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: PROFILE_KEYS.all,
    queryFn: () => listProfiles(),
    select: (result) => result.data ?? [],
    staleTime: 60_000,
  });
}

export function useUpdateProfile(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProfileUpdate) => updateProfile(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROFILE_KEYS.current });
      qc.invalidateQueries({ queryKey: PROFILE_KEYS.all });
    },
  });
}
