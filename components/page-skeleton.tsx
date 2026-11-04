/** Grey placeholders in the shape of a list page, shown while it loads. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-6" aria-busy aria-label="Loading">
      <div className="h-9 w-48 rounded bg-gray-200" />
      <div className="space-y-3 rounded-md bg-mazcina-surface p-4 shadow-sm sm:p-6">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex justify-between gap-4">
            <div className="h-5 w-2/5 rounded bg-gray-200" />
            <div className="h-5 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
