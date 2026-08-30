export function formatCallTimestamp(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${String(remainder)}s`;
  return `${String(minutes)}m ${String(remainder)}s`;
}

export function formatRiskScore(score: number | null): string {
  if (score === null) return "Unknown";
  return `${Math.round(score * 100)}%`;
}

export function formatConfidence(confidence: number | null): string {
  if (confidence === null) return "Unknown";
  return `${Math.round(confidence * 100)}%`;
}

export function formatCallerLabel(input: { callerDisplayName: string | null; callerNumber: string }): string {
  return input.callerDisplayName ?? input.callerNumber;
}
