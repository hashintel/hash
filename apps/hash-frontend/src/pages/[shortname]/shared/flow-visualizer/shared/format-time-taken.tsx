import { differenceInMilliseconds, intervalToDuration } from "date-fns";

import { isNonNullable } from "../../../../../lib/typeguards";

const pad = (num: number) => String(num).padStart(2, "0");

export const formatTimeTaken = (scheduledAt: string, closedAt?: string) => {
  const start = new Date(scheduledAt);

  const elapsed = differenceInMilliseconds(
    closedAt ? new Date(closedAt) : new Date(),
    start,
  );

  const duration = intervalToDuration({ start: 0, end: elapsed });

  return [duration.hours, duration.minutes, duration.seconds]
    .filter(isNonNullable)
    .map(pad)
    .join(":");
};
