import type { DailyBucket } from "../types";

export function WeeklyChart({ buckets }: { buckets: DailyBucket[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <div className="flex h-40 items-end gap-1.5 pt-3 sm:h-48 sm:gap-2 sm:pt-4">
      {buckets.map((bucket) => (
        <div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-24 w-full items-end rounded-full bg-slate-950/50 p-1 sm:h-32">
            <div
              className="w-full rounded-full bg-gradient-to-t from-yellow-500 to-yellow-200 shadow-lg shadow-yellow-400/20 transition-all"
              style={{ height: `${Math.max(8, (bucket.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-400 sm:text-xs">{bucket.label}</span>
          <span className="text-[10px] text-yellow-100 sm:text-xs">{bucket.count}</span>
        </div>
      ))}
    </div>
  );
}
