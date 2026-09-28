export function RouteSkeleton() {
  return (
    <div className="page route-skeleton" role="status" aria-label="Loading page">
      <span className="skeleton-label">Loading your workspace…</span>
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-4 w-80" />
      <div className="skeleton-grid">
        <div className="skeleton h-96" />
        <div className="skeleton h-96" />
      </div>
    </div>
  );
}
