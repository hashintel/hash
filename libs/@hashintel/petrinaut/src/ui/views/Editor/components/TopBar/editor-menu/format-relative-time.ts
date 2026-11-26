const relativeTimeFormat = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

/** How long ago a moment was, and its date once it is a month or more old. */
export const formatRelativeTime = (isoTimestamp: string): string => {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffSecs = Math.round(diffMs / 1_000);
  const diffMins = Math.round(diffMs / 60_000);
  const diffHours = Math.round(diffMs / 3_600_000);
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffSecs < 60) {
    return relativeTimeFormat.format(-diffSecs, "second");
  } else if (diffMins < 60) {
    return relativeTimeFormat.format(-diffMins, "minute");
  } else if (diffHours < 24) {
    return relativeTimeFormat.format(-diffHours, "hour");
  } else if (diffDays < 30) {
    return relativeTimeFormat.format(-diffDays, "day");
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(isoTimestamp));
};
