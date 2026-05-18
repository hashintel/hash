import { z } from "zod";

import type { Metric } from "../types/sdcpn";
import { displayNameSchema } from "../validation/display-name";
import { idSchema } from "./entity-schemas";

export const metricSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description: "Human-readable metric name.",
    }),
    description: z.string().optional().meta({
      description: "Optional metric summary shown to users.",
    }),
    code: z.string().meta({
      description:
        "JavaScript function body invoked with state in scope. It must return one number.",
    }),
  })
  .meta({
    description: "A simulation metric plotted over time.",
  }) satisfies z.ZodType<Metric>;

export type MetricSchema = typeof metricSchema;
