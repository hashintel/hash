import { z } from "zod";

import { displayNameSchema } from "../validation/display-name";
import { entityNameSchema } from "../validation/entity-name";
import { variableNameSchema } from "../validation/variable-name";

import type {
  ArcEndpoint,
  Color,
  ComponentInstance,
  DifferentialEquation,
  InputArc,
  OutputArc,
  Parameter,
  Place,
  Subnet,
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
    itemType: z.enum(["place", "transition", "componentInstance"]).meta({
      description:
        "Whether the positioned node is a place, transition, or component instance.",
    }),
    position: positionSchema,
  })
  .meta({
    description: "A pending canvas-position update for one node.",
  });

export const arcEndpointSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("place"),
      placeId: idSchema.meta({
        description: "ID of a place in the same net as the transition.",
      }),
    }),
    z.strictObject({
      kind: z.literal("componentPort"),
      componentInstanceId: idSchema.meta({
        description:
          "ID of a component instance in the same net as the transition.",
      }),
      portPlaceId: idSchema.meta({
        description:
          "ID of a place marked `isPort: true` in the component instance's referenced subnet.",
      }),
    }),
  ])
  .meta({
    description:
      "Arc endpoint. Normal arcs reference a place in the same net; component-port arcs reference a port place on a subnet instance.",
  }) satisfies z.ZodType<ArcEndpoint>;

const assertSingleArcEndpoint = (ctx: {
  value: { placeId?: string; endpoint?: ArcEndpoint };
  issues: {
    push(issue: {
      code: "custom";
      path: string[];
      message: string;
      input: unknown;
    }): void;
  };
}) => {
  const { placeId, endpoint } = ctx.value;
  if ((placeId === undefined) === (endpoint === undefined)) {
    ctx.issues.push({
      code: "custom",
      path: ["endpoint"],
      message: "Provide exactly one of `placeId` or `endpoint`.",
      input: ctx.value,
    });
  }
};

export const inputArcSchema = z
  .strictObject({
    placeId: idSchema.optional().meta({
      description:
        "Legacy shorthand for a normal input place endpoint. Prefer `endpoint` for new data.",
    }),
    endpoint: arcEndpointSchema.optional().meta({
      description:
        'Input endpoint. Use `kind: "componentPort"` to consume/read/inhibit tokens from a component instance port.',
    }),
    weight: z.number().positive().meta({
      description:
        "Token multiplicity for this input arc. Standard arcs consume this many tokens; read arcs require and expose this many tokens without consuming them; inhibitor arcs require the source place to have fewer than this many tokens. For coloured standard/read input places this also determines the tuple length the transition's lambda and kernel see at `input.PlaceName` (weight 2 means a 2-token array).",
    }),
    type: z.enum(["standard", "inhibitor", "read"]).meta({
      description:
        "Standard arcs consume tokens from the input place; read arcs require and expose tokens to the lambda/kernel but do NOT consume them; inhibitor arcs prevent firing when the source place has at least the weight indicated and are NOT present in the lambda or kernel `input`.",
    }),
  })
  .check(assertSingleArcEndpoint)
  .meta({
    description: "Input arc from a place or component port into a transition.",
  }) satisfies z.ZodType<InputArc>;

export const outputArcSchema = z
  .strictObject({
    placeId: idSchema.optional().meta({
      description:
        "Legacy shorthand for a normal output place endpoint. Prefer `endpoint` for new data.",
    }),
    endpoint: arcEndpointSchema.optional().meta({
      description:
        'Output endpoint. Use `kind: "componentPort"` to produce tokens into a component instance port.',
    }),
    weight: z.number().positive().meta({
      description: "Number of tokens produced into the output place.",
    }),
  })
  .check(assertSingleArcEndpoint)
  .meta({
    description: "Output arc from a transition into a place or component port.",
  }) satisfies z.ZodType<OutputArc>;

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
        "`real` is continuous and may be updated by dynamics. `integer` and `boolean` are discrete token attributes updated by transition kernels. `integer` values are stored as Float64 and rounded on read/write: they are exact only within ±2^53 (±9,007,199,254,740,992); values beyond that lose precision silently.",
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
    isPort: z.boolean().optional().meta({
      description:
        "When true, this place is exposed as a component port on instances of the subnet that contains it.",
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
        "Input arcs that gate transition firing. Standard arcs consume tokens, read arcs observe tokens without consuming them, and inhibitor arcs block firing based on token counts.",
    }),
    outputArcs: z.array(outputArcSchema).meta({
      description:
        "Output arcs that receive tokens after this transition fires.",
    }),
    lambdaType: z.enum(["predicate", "stochastic"]).meta({
      description:
        "Use predicate for boolean enabling logic when transition lambda authoring is available; use stochastic for rate-based firing when stochasticity is available.",
    }),
    lambdaCode: z.string().meta({
      description: [
        "Optional module: `export default Lambda((input, parameters) => …)`.",
        "Lambda code is meaningful only when stochasticity is enabled OR when colours are enabled and the transition has at least one standard or read input arc from a coloured place.",
        "`input` is keyed by INPUT PLACE NAME (PascalCase) for coloured standard and read arcs, and the value is a tuple sized to that arc's weight (weight 2 means a 2-token array).",
        "Read arc tokens are present in `input` but are not consumed when the transition fires.",
        "Inhibitor arcs and uncoloured input places are NOT present in `input`.",
        "Each token is an object keyed by the colour type's element names (e.g. `{ x, y, velocity }`).",
        "`parameters` is keyed by each parameter's `variableName` value (lower_snake_case, e.g. `parameters.infection_rate`).",
        "Predicate lambdas MUST return a boolean (true = enabled given these tokens, false = disabled).",
        "Stochastic lambdas MUST return a non-negative number = expected firings per simulation second (0 disables, Infinity always fires).",
        "Lambda is called per token combination satisfying arc weights, so it MUST be deterministic — put randomness in the transition kernel, not here.",
        "Leave empty when lambda authoring is unavailable; the runtime supplies the always-enabled default.",
      ].join(" "),
    }),
    transitionKernelCode: z.string().meta({
      description: [
        "Optional module: `export default TransitionKernel((input, parameters) => …)`.",
        "Transition kernel code is meaningful only when colours are enabled and the transition has at least one coloured output place.",
        "`input` and `parameters` have the same shape as the transition's lambda.",
        "MUST return an object keyed by OUTPUT PLACE NAME with a tuple sized to that arc's weight. Coloured output places MUST be present; uncoloured output places MUST be omitted (they are auto-populated with empty tokens).",
        "Token attribute values must match the output type: real/integer use numbers, boolean uses booleans. When stochasticity is enabled, `real` attributes may also use `Distribution.Gaussian(mean, sd)` / `Distribution.Uniform(min, max)` / `Distribution.Lognormal(mu, sigma)` (discrete attributes always take plain values); each distribution is sampled once per token, and chained `.map(fn)` calls on the same distribution share that single sample.",
        "Leave empty when no coloured outputs exist.",
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
        "Typed token attributes available on tokens of this colour/type. Element order matters: coloured initial state in scenario per_place mode supplies rows in this order.",
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
        "`tokens` is THIS place's current tokens only — NOT all places' tokens.",
        "MUST return an array of the SAME LENGTH where each entry provides real-valued derivatives (i.e. dx/dt, NOT the new value).",
        "Integer and boolean elements are discrete and remain unchanged by dynamics.",
        "`parameters` is keyed by each parameter's `variableName` value (lower_snake_case, e.g. `parameters.damage_per_second`).",
      ].join(" "),
    }),
  })
  .meta({
    description:
      "A differential equation for continuous dynamics on coloured tokens. The `colorId` MUST match the colour of every place that references this equation via `differentialEquationId`, and returned derivatives only update that colour's real-valued elements.",
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

export const componentInstanceSchema = z
  .strictObject({
    id: idSchema,
    name: entityNameSchema.meta({
      description:
        "PascalCase name for the component instance (e.g. MainProcessor, Ward2). Used as a code-level identifier.",
    }),
    subnetId: idSchema.meta({
      description: "ID of the subnet definition this component instantiates.",
    }),
    parameterValues: z.record(idSchema, z.string()).meta({
      description:
        "Per-instance parameter values keyed by parameter ID from the referenced subnet.",
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
      "A placed instance of a subnet. Parent nets connect to exposed subnet ports with transition arcs.",
  }) satisfies z.ZodType<ComponentInstance>;

export const subnetSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description: "Human-readable subnet name.",
    }),
    places: z.array(placeSchema).meta({
      description: "Places local to this subnet.",
    }),
    transitions: z.array(transitionSchema).meta({
      description: "Transitions local to this subnet.",
    }),
    types: z.array(colorSchema).meta({
      description: "Token types local to this subnet.",
    }),
    differentialEquations: z.array(differentialEquationSchema).meta({
      description: "Differential equations local to this subnet.",
    }),
    parameters: z.array(parameterSchema).meta({
      description: "Parameters local to this subnet.",
    }),
    componentInstances: z.array(componentInstanceSchema).optional().meta({
      description: "Nested component instances local to this subnet.",
    }),
  })
  .meta({
    description:
      "A reusable subnet definition that can be instantiated as a component.",
  }) satisfies z.ZodType<Subnet>;

export type PlaceSchema = typeof placeSchema;
export type TransitionSchema = typeof transitionSchema;
export type ColorSchema = typeof colorSchema;
export type DifferentialEquationSchema = typeof differentialEquationSchema;
export type ParameterSchema = typeof parameterSchema;
export type ComponentInstanceSchema = typeof componentInstanceSchema;
export type SubnetSchema = typeof subnetSchema;
