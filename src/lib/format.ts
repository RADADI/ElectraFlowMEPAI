/**
 * Formatting utilities used across project pages.
 * Extracted from dummy-data.ts so pages never import from dummy-data directly.
 */

export const formatMoney = (n: number | null | undefined): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
};

export const formatDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  return d;
};

export const formatDateTime = (d: string | null | undefined): string => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
};
