export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
