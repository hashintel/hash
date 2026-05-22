import { z } from "zod";

import { displayNameSchema } from "../validation/display-name";
import { entityNameSchema } from "../validation/entity-name";
import { variableNameSchema } from "../validation/variable-name";

import type {
  Color,
  DifferentialEquation,
  Parameter,
  Place,
  Transition,
} from "../types/sdcpn";

export const idSchema = z.string().min(1).meta({
  description:
    "Stable identifier for an SDCPN entity. Use unique IDs within the net.",
});

export const positionSchema = z
  .strictObject({
    x: z.number().meta({
      description: "Horizontal canvas position.",
    }),
    y: z.number().meta({
      description: "Vertical canvas position.",
    }),
  })
  .meta({
    description: "Canvas position for a place or transition.",
  });

export const nodePositionCommitSchema = z
  .strictObject({
    id: idSchema,
    itemType: z.enum(["place", "transition"]).meta({
      description: "Whether the positioned node is a place or transition.",
    }),
    position: positionSchema,
  })
  .meta({
    description: "A pending canvas-position update for one node.",
  });

export const inputArcSchema = z
  .strictObject({
    placeId: idSchema.meta({
      description: "ID of the input place connected to the transition.",
    }),
    weight: z.number().positive().meta({
      description:
        "Number of tokens consumed from the input place per firing. For coloured input places this also determines the tuple length the transition's lambda and kernel see at `input.PlaceName` (weight 2 means a 2-token array).",
    }),
    type: z.enum(["standard", "inhibitor"]).meta({
      description:
        "Standard arcs consume tokens from the input place; inhibitor arcs prevent firing when the source place has at least the weight indicated. Inhibitor arcs do NOT consume tokens and their place is NOT present in the lambda or kernel `input`.",
    }),
  })
  .meta({
    description: "Input arc from a place into a transition.",
  });

export const outputArcSchema = z
  .strictObject({
    placeId: idSchema.meta({
      description: "ID of the output place connected from the transition.",
    }),
    weight: z.number().positive().meta({
      description: "Number of tokens produced into the output place.",
    }),
  })
  .meta({
    description: "Output arc from a transition into a place.",
  });

export const arcDirectionSchema = z.enum(["input", "output"]).meta({
  description:
    "Whether the arc connects a place into a transition or a transition out to a place.",
});

export const colorElementSchema = z
  .strictObject({
    elementId: idSchema.meta({
      description: "Stable identifier for this colour element.",
    }),
    name: displayNameSchema
      .check(
        z.refine((val) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(val), {
          message:
            "Element name must be a valid JavaScript identifier (start with a letter, `_`, or `$`; only letters, digits, `_`, `$` allowed).",
        }),
      )
      .meta({
        description:
          "Token attribute identifier used DIRECTLY in code. Lambdas, kernels, dynamics, visualizers, and metrics destructure tokens as `{ <name> }`, so this must be a valid JavaScript identifier (e.g. `machine_damage_ratio`, `x`, `velocity`). Spaces, hyphens, and leading digits will break user code that references the attribute; prefer lower_snake_case for consistency with parameter naming.",
      }),
    type: z.enum(["real", "integer", "boolean"]).meta({
      description:
        "Primitive token attribute type. Note: the simulation buffer stores all values as Float64; `integer`/`boolean` are documentation/type-hints only, not enforced at runtime.",
    }),
  })
  .meta({
    description: "One typed attribute on a coloured token.",
  });

export const placeSchema = z
  .strictObject({
    id: idSchema,
    name: entityNameSchema.meta({
      description:
        "PascalCase identifier used DIRECTLY in user code: lambdas and kernels reference input/output places as `input.PlaceName` and `{ PlaceName: [...] }`, metrics access them as `state.places.PlaceName.count`, scenario code-mode initial state keys are place names, and visualizer scope is implicitly per-place. Renaming a place breaks every code reference, so rename only when you also update dependent lambda/kernel/dynamics/metric/visualizer/scenario code in the same batch.",
    }),
    colorId: idSchema.nullable().meta({
      description:
        "ID of the token colour/type accepted by this place, or null for uncoloured token counts. Uncoloured places have no token attributes and do not appear in lambda/kernel `input` objects.",
    }),
    dynamicsEnabled: z.boolean().meta({
      description:
        "Whether tokens in this place are updated by a differential equation during simulation. Dynamics only run when this is true AND `differentialEquationId` is set AND `colorId` is set.",
    }),
    differentialEquationId: idSchema.nullable().meta({
      description:
        "ID of the differential equation used for continuous dynamics, or null when dynamics are disabled. The referenced equation's `colorId` MUST match this place's `colorId`.",
    }),
    visualizerCode: z.string().optional().meta({
      description:
        "Optional module: `export default Visualization(({ tokens, parameters }) => <JSX/>)`. JSX is compiled with React's CLASSIC runtime — do NOT `import React`, do NOT use `<>…</>` fragments (use `<g>` or explicit elements), and do NOT use hooks; treat it as a pure render. `tokens` is this place's current tokens (only meaningful for coloured places; empty for uncoloured). `parameters` is keyed by each parameter's `variableName` value (lower_snake_case, e.g. `parameters.crash_threshold`). Convention is to return a sized `<svg viewBox=\"0 0 800 600\">…</svg>`.",
    }),
    showAsInitialState: z.boolean().optional().meta({
      description:
        "Optional UI hint to show this place in the initial-state view.",
    }),
    x: z.number().meta({
      description: "Horizontal canvas position.",
    }),
    y: z.number().meta({
      description: "Vertical canvas position.",
    }),
  })
  .meta({
    description:
      "A Petri net place. Places store tokens and may optionally use colours and continuous dynamics.",
  }) satisfies z.ZodType<Place>;

export const transitionSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description: "Human-readable transition name.",
    }),
    inputArcs: z.array(inputArcSchema).meta({
      description:
        "Input arcs that gate and consume tokens for this transition.",
    }),
    outputArcs: z.array(outputArcSchema).meta({
      description:
        "Output arcs that receive tokens after this transition fires.",
    }),
    lambdaType: z.enum(["predicate", "stochastic"]).meta({
      description:
        "Use predicate for boolean enabling logic; use stochastic for rate-based firing.",
    }),
    lambdaCode: z.string().meta({
      description: [
        "Module: `export default Lambda((input, parameters) => …)`.",
        "`input` is keyed by INPUT PLACE NAME (PascalCase) and the value is a tuple sized to that arc's weight (weight 2 means a 2-token array).",
        "Inhibitor arcs and uncoloured input places are NOT present in `input`.",
        "Each token is an object keyed by the colour type's element names (e.g. `{ x, y, velocity }`).",
        "`parameters` is keyed by each parameter's `variableName` value (lower_snake_case, e.g. `parameters.infection_rate`).",
        "Predicate lambdas MUST return a boolean (true = enabled given these tokens, false = disabled).",
        "Stochastic lambdas MUST return a non-negative finite number = expected firings per simulation second (0 disables, Infinity always fires).",
        "Lambda is called per token combination satisfying arc weights, so it MUST be deterministic — put randomness in the transition kernel, not here.",
      ].join(" "),
    }),
    transitionKernelCode: z.string().meta({
      description: [
        "Module: `export default TransitionKernel((input, parameters) => …)`.",
        "`input` and `parameters` have the same shape as the transition's lambda.",
        "MUST return an object keyed by OUTPUT PLACE NAME with a tuple sized to that arc's weight. Coloured output places MUST be present; uncoloured output places MUST be omitted (they are auto-populated with empty tokens).",
        "Token attribute values can be plain numbers/booleans OR `Distribution.Gaussian(mean, sd)` / `Distribution.Uniform(min, max)` / `Distribution.Lognormal(mu, sigma)`; each distribution is sampled once per token, and chained `.map(fn)` calls on the same distribution share that single sample (useful for deriving multiple attributes from one draw).",
        "Always required even when no stochasticity is needed; use `export default TransitionKernel(() => ({}))` when every output place is uncoloured.",
      ].join(" "),
    }),
    x: z.number().meta({
      description: "Horizontal canvas position.",
    }),
    y: z.number().meta({
      description: "Vertical canvas position.",
    }),
  })
  .meta({
    description:
      "A Petri net transition. Transitions connect places and define firing logic.",
  }) satisfies z.ZodType<Transition>;

export const colorSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description: "Human-readable colour/type name.",
    }),
    iconSlug: z.string().min(1).meta({
      description:
        'Short icon identifier used by the UI for this colour/type. Typical values are `"circle"` or `"square"`; the UI defaults to `"circle"`.',
    }),
    displayColor: z.string().min(1).meta({
      description:
        'CSS colour string for the UI badge, e.g. `"#1E90FF"` or `"rgb(30,144,255)"`.',
    }),
    elements: z.array(colorElementSchema).meta({
      description:
        "Typed token attributes available on tokens of this colour/type. Element order matters: coloured initial state in scenario per_place mode supplies `number[][]` rows in this order.",
    }),
  })
  .meta({
    description:
      "A coloured-token type. Coloured places store token objects with these attributes.",
  }) satisfies z.ZodType<Color>;

export const differentialEquationSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description: "Human-readable dynamics name.",
    }),
    colorId: idSchema.nullable().meta({
      description:
        "ID of the colour/type whose token attributes this dynamics function updates. MUST match the `colorId` of every place that references this equation via `differentialEquationId`.",
    }),
    code: z.string().meta({
      description: [
        "Module: `export default Dynamics((tokens, parameters) => …)`.",
        "`tokens` is THIS place's current tokens only — `Array<{ [elementName]: number }>` — NOT all places' tokens.",
        "MUST return an array of the SAME LENGTH where each entry is `{ [elementName]: derivative }` (i.e. dx/dt, NOT the new value).",
        "The engine integrates with Euler: `next = current + derivative * dt`.",
        "Missing keys default to 0 silently, so return every element your colour type declares.",
        "`parameters` is keyed by each parameter's `variableName` value (lower_snake_case, e.g. `parameters.damage_per_second`).",
      ].join(" "),
    }),
  })
  .meta({
    description:
      "A differential equation for continuous dynamics on coloured tokens. The `colorId` MUST match the colour of every place that references this equation via `differentialEquationId`, and the returned derivative keys MUST cover that colour's elements.",
  }) satisfies z.ZodType<DifferentialEquation>;

export const parameterSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description: "Human-readable parameter name.",
    }),
    variableName: variableNameSchema.meta({
      description:
        "lower_snake_case identifier used DIRECTLY in user code as `parameters.<value>` (e.g. `parameters.crash_threshold`, NOT `parameters.crashThreshold`). Must start with a lowercase letter; only `[a-z0-9_]` allowed.",
    }),
    type: z.enum(["real", "integer", "boolean"]).meta({
      description:
        "Primitive parameter type. Note: parameter values are stored numerically (booleans coerce via `Number()`); the type is primarily a documentation/UI hint.",
    }),
    defaultValue: z.string().meta({
      description:
        'Default parameter value as a plain numeric string (e.g. `"3"`, `"0.05"`). Parsed via `Number()` with a `|| 0` fallback, so non-numeric strings silently become 0. Expressions are NOT supported here — use scenario `parameterOverrides` for expressions.',
    }),
  })
  .meta({
    description:
      "A net-level parameter available to executable SDCPN code and scenarios.",
  }) satisfies z.ZodType<Parameter>;

export type PlaceSchema = typeof placeSchema;
export type TransitionSchema = typeof transitionSchema;
export type ColorSchema = typeof colorSchema;
export type DifferentialEquationSchema = typeof differentialEquationSchema;
export type ParameterSchema = typeof parameterSchema;
