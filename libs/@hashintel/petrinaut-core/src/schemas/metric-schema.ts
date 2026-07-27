import { z } from "zod";

import { displayNameSchema } from "../validation/display-name";
import { idSchema } from "./entity-schemas";

import type { Metric } from "../types/sdcpn";

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
      description: [
        "Plain function body (NOT a module — no `export default`, no `Metric(...)` wrapper, no enclosing `function` declaration).",
        "`state` is in scope, and net `parameters` are available ambiently (`parameters.variableName`). The body MUST `return` a finite number — NaN, Infinity, and -Infinity throw and the metric series shows an error.",
        "Access places by NAME: `state.places.PlaceName.count` (token count for any place) and `state.places.PlaceName.tokens` (typed token objects for coloured places; always `[]` for uncoloured places).",
        "Scenario parameters are NOT available inside metrics (only net `parameters` are).",
        "Example: `const i = state.places.Infected.count; const r = state.places.Recovered.count; return (i + r) === 0 ? 0 : i / (i + r);`",
      ].join(" "),
    }),
  })
  .meta({
    description: "A simulation metric plotted over time.",
  }) satisfies z.ZodType<Metric>;

export type MetricSchema = typeof metricSchema;
