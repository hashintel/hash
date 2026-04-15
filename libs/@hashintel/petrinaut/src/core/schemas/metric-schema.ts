import { z } from "zod";

import type { Metric } from "../types/sdcpn";

export const metricSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Metric name is required"),
  description: z.string().optional(),
  code: z.string(),
}) satisfies z.ZodType<Metric>;

export type MetricSchema = typeof metricSchema;
