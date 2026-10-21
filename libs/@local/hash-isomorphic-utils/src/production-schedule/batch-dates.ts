import type { z } from "zod";

const dayMs = 86_400_000;

export const inclusiveProductionScheduleSpanDays = (
  start: string,
  end: string,
): number =>
  Math.floor(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / dayMs,
  ) + 1;

export const validateBatchDates = (
  batch: {
    start: string;
    end: string;
    span_days: number;
  },
  path: (string | number)[],
  context: z.RefinementCtx,
): void => {
  if (batch.start > batch.end) {
    context.addIssue({
      code: "custom",
      message: "start must not be after end",
      path: [...path, "start"],
    });
  }
  const expectedSpan = inclusiveProductionScheduleSpanDays(
    batch.start,
    batch.end,
  );
  if (batch.span_days !== expectedSpan) {
    context.addIssue({
      code: "custom",
      message: `span_days must equal the inclusive start/end span (${expectedSpan})`,
      path: [...path, "span_days"],
    });
  }
};
