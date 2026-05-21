export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatTimeSince(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) {
    return "unknown";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function statusBadgeClass(status: string): string {
  const upper = status.toUpperCase();
  if (upper.includes("RUN") || upper === "CREATING") {
    return "badge-running";
  }
  if (upper.includes("FINISH") || upper.includes("DONE")) {
    return "badge-finished";
  }
  if (upper.includes("ERROR") || upper.includes("FAIL")) {
    return "badge-errored";
  }
  if (upper.includes("CANCEL")) {
    return "badge-cancelled";
  }
  return "badge-idle";
}
