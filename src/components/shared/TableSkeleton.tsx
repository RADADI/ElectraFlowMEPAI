import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TableSkeleton({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {Array.from({ length: cols }).map((_, i) => (
            <TableHead key={i} className="px-3">
              <Skeleton className="h-4 w-20" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i} className="hover:bg-transparent">
            {Array.from({ length: cols }).map((_, j) => (
              <TableCell key={j} className="px-3">
                <Skeleton
                  className={`h-4 ${j === 0 ? "w-36" : j === cols - 1 ? "w-16" : "w-24"}`}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-end gap-2 h-48">
        {[60, 80, 45, 90, 70, 55, 85, 65, 75, 50, 88, 72].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="flex gap-2 justify-center">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-3 w-16 rounded-full" />
        ))}
      </div>
    </div>
  );
}
