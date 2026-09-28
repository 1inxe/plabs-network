export function ServiceStatus({
  error,
  fetching,
  updatedAt,
}: {
  error: boolean;
  fetching: boolean;
  updatedAt: number;
}) {
  return (
    <span className={`service-status ${error ? 'stale' : ''}`} role="status">
      <span className={`status-dot ${error ? 'muted' : ''}`} />
      {error
        ? updatedAt
          ? 'Last available data · reconnecting'
          : 'Service unavailable'
        : fetching
          ? 'Updating…'
          : updatedAt
            ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Connecting…'}
    </span>
  );
}
