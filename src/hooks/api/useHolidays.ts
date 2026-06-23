import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listHolidays,
  createHoliday,
  updateHoliday,
  archiveHoliday,
} from "@/services/holiday.service";
import type { HolidayCreateInput, HolidayUpdateInput } from "@/types/timesheet-view";

export const HOLIDAY_KEYS = {
  all: ["holidays"] as const,
};

export function useHolidays() {
  return useQuery({
    queryKey: HOLIDAY_KEYS.all,
    queryFn: () => listHolidays(),
    select: (result) => result.data ?? [],
    staleTime: 5 * 60_000,
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HolidayCreateInput) => createHoliday(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOLIDAY_KEYS.all });
    },
  });
}

export function useUpdateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: HolidayUpdateInput }) =>
      updateHoliday(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOLIDAY_KEYS.all });
    },
  });
}

export function useArchiveHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveHoliday(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOLIDAY_KEYS.all });
    },
  });
}
