import { z } from "zod";

import { displayNameSchema } from "../validation/display-name";
import { entityNameSchema } from "../validation/entity-name";

import type { Color, DifferentialEquation, Parameter, Place, Transition } from "../types/sdcpn";

export const idSchema = z.string().min(1).meta({
  description: "Stable identifier for an SDCPN entity. Use unique IDs within the net.",
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
      description: "Number of tokens consumed from the input place.",
    }),
    type: z.enum(["standard", "inhibitor"]).meta({
      description:
        "Standard arcs consume tokens from the input place; inhibitor arcs prevent firing when the source place has at least the weight indicated.",
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
  description: "Whether the arc connects a place into a transition or a transition out to a place.",
});

export const colorElementSchema = z
  .strictObject({
    elementId: idSchema.meta({
      description: "Stable identifier for this colour element.",
    }),
    name: displayNameSchema.meta({
      description: "Token attribute name used in lambda, kernel, visualizer, and dynamics code.",
    }),
    type: z.enum(["real", "integer", "boolean"]).meta({
      description: "Primitive token attribute type.",
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
        "PascalCase place name. Use concise names that can be referenced by transition code.",
    }),
    colorId: idSchema.nullable().meta({
      description:
        "ID of the token colour/type accepted by this place, or null for uncoloured token counts.",
    }),
    dynamicsEnabled: z.boolean().meta({
      description:
        "Whether tokens in this place are updated by a differential equation during simulation.",
    }),
    differentialEquationId: idSchema.nullable().meta({
      description:
        "ID of the differential equation used for continuous dynamics, or null when dynamics are disabled.",
    }),
    visualizerCode: z.string().optional().meta({
      description: "Optional visualization module code for rendering tokens in this place.",
    }),
    showAsInitialState: z.boolean().optional().meta({
      description: "Optional UI hint to show this place in the initial-state view.",
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
      description: "Input arcs that gate and consume tokens for this transition.",
    }),
    outputArcs: z.array(outputArcSchema).meta({
      description: "Output arcs that receive tokens after this transition fires.",
    }),
    lambdaType: z.enum(["predicate", "stochastic"]).meta({
      description:
        "Use predicate for boolean enabling logic; use stochastic for rate-based firing.",
    }),
    lambdaCode: z.string().meta({
      description:
        "JavaScript module code exporting Lambda(...). Predicate lambdas return booleans; stochastic lambdas return rates.",
    }),
    transitionKernelCode: z.string().meta({
      description:
        "Optional JavaScript module code exporting TransitionKernel(...). Use distributions here to create stochastic output token attributes.",
    }),
    x: z.number().meta({
      description: "Horizontal canvas position.",
    }),
    y: z.number().meta({
      description: "Vertical canvas position.",
    }),
  })
  .meta({
    description: "A Petri net transition. Transitions connect places and define firing logic.",
  }) satisfies z.ZodType<Transition>;

export const colorSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description: "Human-readable colour/type name.",
    }),
    iconSlug: z.string().min(1).meta({
      description: "Icon identifier used by the UI for this colour/type.",
    }),
    displayColor: z.string().min(1).meta({
      description: "CSS colour used by the UI to display this colour/type.",
    }),
    elements: z.array(colorElementSchema).meta({
      description: "Typed token attributes available on tokens of this colour/type.",
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
      description: "ID of the colour/type whose token attributes this dynamics function updates.",
    }),
    code: z.string().meta({
      description:
        "JavaScript module code exporting Dynamics(...). Return derivatives for each token attribute that changes continuously.",
    }),
  })
  .meta({
    description: "A differential equation for continuous dynamics on coloured tokens.",
  }) satisfies z.ZodType<DifferentialEquation>;

export const parameterSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description: "Human-readable parameter name.",
    }),
    variableName: z.string().min(1).meta({
      description: "Identifier used by lambda, kernel, visualizer, metric, and dynamics code.",
    }),
    type: z.enum(["real", "integer", "boolean"]).meta({
      description: "Primitive parameter type.",
    }),
    defaultValue: z.string().meta({
      description: "Default parameter value as an expression string parsed by the simulator.",
    }),
  })
  .meta({
    description: "A net-level parameter available to executable SDCPN code and scenarios.",
  }) satisfies z.ZodType<Parameter>;

export type PlaceSchema = typeof placeSchema;
export type TransitionSchema = typeof transitionSchema;
export type ColorSchema = typeof colorSchema;
export type DifferentialEquationSchema = typeof differentialEquationSchema;
export type ParameterSchema = typeof parameterSchema;
