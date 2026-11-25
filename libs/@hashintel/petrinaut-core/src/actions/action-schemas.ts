import { z } from "zod";

import {
  arcEndpointSchema,
  arcDirectionSchema,
  arcIdSchema,
  colorElementSchema,
  colorSchema,
  componentInstanceSchema,
  componentReferenceSchema,
  differentialEquationSchema,
  fusionMemberSchema,
  fusionSchema,
  idSchema,
  inputArcSchema,
  nodePositionCommitSchema,
  parameterObjectSchema,
  parameterSchema,
  placeSchema,
  positionSchema,
  componentSchema,
  transitionSchema,
} from "../schemas/entity-schemas";
import { metricSchema as simulationMetricSchema } from "../schemas/metric-schema";
import { scenarioSchema as simulationScenarioSchema } from "../schemas/scenario-schema";

import type { SelectionItem } from "../document/selection";

export {
  arcEndpointSchema,
  arcDirectionSchema,
  colorElementSchema,
  colorSchema,
  componentInstanceSchema,
  differentialEquationSchema,
  fusionSchema,
  idSchema,
  nodePositionCommitSchema,
  parameterSchema,
  placeSchema,
  positionSchema,
  componentSchema,
  transitionSchema,
} from "../schemas/entity-schemas";
export {
  metricSchema as simulationMetricSchema,
  type MetricSchema,
} from "../schemas/metric-schema";
export {
  scenarioParameterSchema,
  scenarioSchema as simulationScenarioSchema,
  type ScenarioSchema,
} from "../schemas/scenario-schema";
export {
  simulationMetricSchema as metricSchema,
  simulationScenarioSchema as scenarioSchema,
};

export const placeUpdateSchema = placeSchema
  .omit({ id: true, x: true, y: true })
  .partial()
  .meta({
    description:
      "Fields to assign to an existing place. Omitted fields are left unchanged.",
  });

export const transitionUpdateSchema = transitionSchema
  .omit({ id: true, inputArcs: true, outputArcs: true, x: true, y: true })
  .partial()
  .meta({
    description:
      "Fields to assign to an existing transition. Omitted fields are left unchanged.",
  });

export const colorUpdateSchema = colorSchema
  .omit({ id: true, elements: true })
  .partial()
  .meta({
    description:
      "Fields to assign to an existing colour/type. Omitted fields are left unchanged.",
  });

export const colorElementUpdateSchema = colorElementSchema
  .omit({ elementId: true })
  .partial()
  .meta({
    description:
      "Fields to assign to an existing colour/type element. Omitted fields are left unchanged.",
  });

export const differentialEquationUpdateSchema = differentialEquationSchema
  .omit({ id: true })
  .partial()
  .meta({
    description:
      "Fields to assign to an existing differential equation. Omitted fields are left unchanged.",
  });

export const parameterUpdateSchema = parameterObjectSchema
  .omit({ id: true })
  .partial()
  .meta({
    description:
      "Fields to assign to an existing parameter. Omitted fields are left unchanged.",
  });

export const scenarioUpdateSchema = simulationScenarioSchema
  .omit({ id: true })
  .partial()
  .meta({
    description:
      "Fields to assign to an existing scenario. Omitted fields are left unchanged.",
  });

export const metricUpdateSchema = simulationMetricSchema
  .omit({ id: true })
  .partial()
  .meta({
    description:
      "Fields to assign to an existing metric. Omitted fields are left unchanged.",
  });

// JSON has no `undefined` to clear a field with, so the two updates below
// each take a value that says it. Only an update does: what is stored holds a
// reference or `true`, or no key.
export const componentInstanceUpdateSchema = componentInstanceSchema
  .omit({ id: true, x: true, y: true })
  .partial()
  .extend({
    implementation: componentReferenceSchema.nullable().optional().meta({
      description:
        "For an instance of an interface: the component to run, as `{ id }` for a component of the document or `{ from, id }` for a component of an import, or null to clear the instance's choice, so that it runs the document's default implementation for the interface. Omit to leave the choice as it is.",
    }),
  })
  .meta({
    description:
      "Fields to assign to an existing component instance. Omitted fields are left unchanged.",
  });

export const componentUpdateSchema = componentSchema
  .omit({
    id: true,
    places: true,
    transitions: true,
    types: true,
    differentialEquations: true,
    parameters: true,
    componentInstances: true,
    fusions: true,
  })
  .partial()
  .extend({
    interface: z.boolean().optional().meta({
      description:
        "true makes the component an interface: a signature of ports, types and parameters with no transitions, which implements no interface itself. false makes an interface an ordinary component again. Omit to leave it as it is.",
    }),
  })
  .meta({
    description:
      "Fields to assign to an existing component. Omitted fields are left unchanged.",
  });

export const fusionUpdateSchema = fusionSchema
  .omit({ id: true, members: true })
  .partial()
  // A fusion always has a name: an update changes it or leaves it out.
  .extend({ name: fusionSchema.shape.name.exactOptional() })
  .meta({
    description:
      "Fields to assign to an existing fusion. Members change through `addFusionMember`, `removeFusionMember` and `replaceFusionMember`.",
  });

const targetComponentIdSchema = idSchema.nullable().optional().meta({
  description:
    "Optional ID of the component to mutate. Omit or pass null to mutate the root net.",
});

const arcEndpointInputFields = {
  placeId: idSchema.optional().meta({
    description:
      "Legacy shorthand for a normal place endpoint in the same net as the transition.",
  }),
  endpoint: arcEndpointSchema.optional().meta({
    description:
      'Arc endpoint. Use `kind: "componentPort"` to connect the transition to a port on a component instance.',
  }),
};

const assertSingleArcEndpointInput = (ctx: {
  value: { placeId?: string; endpoint?: unknown };
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

const assertArcEndpointReplacementInput = (ctx: {
  value: {
    oldPlaceId?: string;
    newPlaceId?: string;
    oldEndpoint?: unknown;
    newEndpoint?: unknown;
  };
  issues: {
    push(issue: {
      code: "custom";
      path: string[];
      message: string;
      input: unknown;
    }): void;
  };
}) => {
  const hasOldPlace = ctx.value.oldPlaceId !== undefined;
  const hasOldEndpoint = ctx.value.oldEndpoint !== undefined;
  const hasNewPlace = ctx.value.newPlaceId !== undefined;
  const hasNewEndpoint = ctx.value.newEndpoint !== undefined;

  if (hasOldPlace === hasOldEndpoint) {
    ctx.issues.push({
      code: "custom",
      path: ["oldEndpoint"],
      message: "Provide exactly one of `oldPlaceId` or `oldEndpoint`.",
      input: ctx.value,
    });
  }
  if (hasNewPlace === hasNewEndpoint) {
    ctx.issues.push({
      code: "custom",
      path: ["newEndpoint"],
      message: "Provide exactly one of `newPlaceId` or `newEndpoint`.",
      input: ctx.value,
    });
  }
};

export const itemTypeAndIdSchema = z
  .discriminatedUnion("type", [
    z.strictObject({ type: z.literal("place"), id: idSchema }),
    z.strictObject({ type: z.literal("transition"), id: idSchema }),
    z.strictObject({ type: z.literal("arc"), id: arcIdSchema }),
    z.strictObject({ type: z.literal("componentInstance"), id: idSchema }),
    z.strictObject({ type: z.literal("fusion"), id: idSchema }),
    z.strictObject({ type: z.literal("type"), id: idSchema }),
    z.strictObject({ type: z.literal("differentialEquation"), id: idSchema }),
    z.strictObject({ type: z.literal("parameter"), id: idSchema }),
    z.strictObject({ type: z.literal("metric"), id: idSchema }),
  ])
  .meta({
    description:
      "An item to delete. Arc IDs use Petrinaut's generated arc ID format.",
  }) satisfies z.ZodType<SelectionItem>;

export const mutationActionInputSchemas = {
  addPlace: placeSchema
    .extend({ targetComponentId: targetComponentIdSchema })
    .meta({
      description: "Add a place that stores tokens in the SDCPN.",
    }),
  updatePlace: z
    .strictObject({
      placeId: idSchema,
      update: placeUpdateSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Update fields on an existing place." }),
  updatePlacePosition: z
    .strictObject({
      placeId: idSchema,
      position: positionSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Update an existing place's canvas position." }),
  removePlace: z
    .strictObject({
      placeId: idSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Remove a place and any arcs connected to it." }),
  addTransition: transitionSchema
    .extend({ targetComponentId: targetComponentIdSchema })
    .meta({
      description: "Add a transition with firing logic and arcs.",
    }),
  updateTransition: z
    .strictObject({
      transitionId: idSchema,
      update: transitionUpdateSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description:
        "Update a transition's properties, arcs, or executable code.",
    }),
  updateTransitionPosition: z
    .strictObject({
      transitionId: idSchema,
      position: positionSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Update an existing transition's canvas position." }),
  removeTransition: z
    .strictObject({
      transitionId: idSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Remove a transition." }),
  addArc: z
    .strictObject({
      transitionId: idSchema,
      arcDirection: arcDirectionSchema,
      ...arcEndpointInputFields,
      weight: z.number().positive().meta({
        description: "Token multiplicity for the arc.",
      }),
      type: inputArcSchema.shape.type.optional().meta({
        description:
          "Input arc type, only valid when arcDirection is input. Standard arcs consume tokens; read arcs inspect tokens without consuming them; inhibitor arcs block firing when enough tokens are present. Omit this for output arcs.",
      }),
      targetComponentId: targetComponentIdSchema,
    })
    .check(assertSingleArcEndpointInput)
    .check((ctx) => {
      const input = ctx.value;
      if (input.arcDirection === "output" && input.type !== undefined) {
        ctx.issues.push({
          code: "custom",
          path: ["type"],
          message:
            'Output arcs do not have an input arc type. Omit `type` when `arcDirection` is "output".',
          input: input.type,
        });
      }
    })
    .meta({ description: "Add an input or output arc to a transition." }),
  removeArc: z
    .strictObject({
      transitionId: idSchema,
      arcDirection: arcDirectionSchema,
      ...arcEndpointInputFields,
      targetComponentId: targetComponentIdSchema,
    })
    .check(assertSingleArcEndpointInput)
    .meta({ description: "Remove an input or output arc from a transition." }),
  updateArcWeight: z
    .strictObject({
      transitionId: idSchema,
      arcDirection: arcDirectionSchema,
      ...arcEndpointInputFields,
      weight: z.number().positive().meta({
        description: "Replacement token multiplicity for the arc.",
      }),
      targetComponentId: targetComponentIdSchema,
    })
    .check(assertSingleArcEndpointInput)
    .meta({ description: "Update the token weight on an existing arc." }),
  updateArcType: z
    .strictObject({
      transitionId: idSchema,
      ...arcEndpointInputFields,
      type: inputArcSchema.shape.type.meta({
        description: "Replacement input arc type.",
      }),
      targetComponentId: targetComponentIdSchema,
    })
    .check(assertSingleArcEndpointInput)
    .meta({ description: "Update an existing input arc's type." }),
  updateArcPlace: z
    .strictObject({
      transitionId: idSchema,
      arcDirection: arcDirectionSchema,
      oldPlaceId: idSchema.optional().meta({
        description: "Current place ID used by the arc.",
      }),
      oldEndpoint: arcEndpointSchema.optional().meta({
        description: "Current endpoint used by the arc.",
      }),
      newPlaceId: idSchema.optional().meta({
        description: "Replacement place ID for the arc.",
      }),
      newEndpoint: arcEndpointSchema.optional().meta({
        description: "Replacement endpoint for the arc.",
      }),
      targetComponentId: targetComponentIdSchema,
    })
    .check(assertArcEndpointReplacementInput)
    .meta({ description: "Update the endpoint on an existing arc." }),
  addType: colorSchema
    .extend({ targetComponentId: targetComponentIdSchema })
    .meta({
      description: "Add a coloured-token type.",
    }),
  updateType: z
    .strictObject({
      typeId: idSchema,
      update: colorUpdateSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Update fields on an existing colour/type." }),
  removeType: z
    .strictObject({
      typeId: idSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description:
        "Remove a colour/type and clear references from places and dynamics.",
    }),
  addTypeElement: z
    .strictObject({
      typeId: idSchema,
      element: colorElementSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Add an element to a coloured-token type." }),
  updateTypeElement: z
    .strictObject({
      typeId: idSchema,
      elementId: idSchema,
      update: colorElementUpdateSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Update fields on an existing type element." }),
  removeTypeElement: z
    .strictObject({
      typeId: idSchema,
      elementId: idSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Remove an element from a coloured-token type." }),
  moveTypeElement: z
    .strictObject({
      typeId: idSchema,
      elementId: idSchema,
      toIndex: z.number().int().nonnegative().meta({
        description: "Destination index for the element within the type.",
      }),
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Move an element within a coloured-token type." }),
  addDifferentialEquation: differentialEquationSchema
    .extend({ targetComponentId: targetComponentIdSchema })
    .meta({
      description: "Add continuous dynamics for a coloured-token type.",
    }),
  updateDifferentialEquation: z
    .strictObject({
      equationId: idSchema,
      update: differentialEquationUpdateSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description: "Update fields on an existing differential equation.",
    }),
  removeDifferentialEquation: z
    .strictObject({
      equationId: idSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description:
        "Remove a differential equation and clear references from places.",
    }),
  addParameter: parameterSchema
    .extend({ targetComponentId: targetComponentIdSchema })
    .meta({
      description: "Add a net-level parameter available to SDCPN code.",
    }),
  updateParameter: z
    .strictObject({
      parameterId: idSchema,
      update: parameterUpdateSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Update fields on an existing parameter." }),
  removeParameter: z
    .strictObject({
      parameterId: idSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Remove a net-level parameter." }),
  addScenario: simulationScenarioSchema.meta({
    description: [
      "Add a simulation scenario.",
      "Include `scenarioParameters` for key user-tunable assumptions (reference them in expressions as `scenario.<identifier>`).",
      "`parameterOverrides` keys MUST be existing net-level parameter IDs; omit the field entirely when nothing is overridden.",
      "`initialState.content` keys are place IDs when `type` is `per_place`, but place NAMES when `type` is `code` (note the asymmetry).",
      "Never author `initialState.type` `adhoc` — that variant belongs to the in-app form; use `per_place` or `code`.",
    ].join(" "),
  }),
  updateScenario: z
    .strictObject({
      scenarioId: idSchema,
      update: scenarioUpdateSchema,
    })
    .meta({ description: "Update fields on an existing scenario." }),
  removeScenario: z
    .strictObject({ scenarioId: idSchema })
    .meta({ description: "Remove a simulation scenario." }),
  addMetric: simulationMetricSchema.meta({
    description:
      "Add a simulation metric (a time-series scalar plotted in the simulate view). Note: metric `code` is a plain function body with `state` in scope — do NOT wrap it in `export default Metric(...)` or any other module syntax.",
  }),
  updateMetric: z
    .strictObject({
      metricId: idSchema,
      update: metricUpdateSchema,
    })
    .meta({ description: "Update fields on an existing metric." }),
  removeMetric: z
    .strictObject({ metricId: idSchema })
    .meta({ description: "Remove a simulation metric." }),
  addComponent: componentSchema.meta({
    description:
      "Add a component: a net of its own that instances reuse. Mark its places with `isPort: true` to expose them as ports.",
  }),
  updateComponent: z
    .strictObject({
      componentId: idSchema,
      update: componentUpdateSchema,
    })
    .meta({ description: "Update fields on an existing component." }),
  removeComponent: z.strictObject({ componentId: idSchema }).meta({
    description:
      "Remove a component and the component instances that reference it.",
  }),
  addComponentInstance: componentInstanceSchema
    .extend({ targetComponentId: targetComponentIdSchema })
    .meta({
      description:
        "Place an instance of a component in the root net or in another component: a component of the document, named by `component: { id }`, or a component of a library the application resolves, named by `component: { from, id }`. The first instance to name a library, for its `component` or for its `implementation`, adds it to the document's `imports`.",
    }),
  updateComponentInstance: z
    .strictObject({
      instanceId: idSchema,
      update: componentInstanceUpdateSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Update fields on an existing component instance." }),
  updateComponentInstancePosition: z
    .strictObject({
      instanceId: idSchema,
      position: positionSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description: "Update an existing component instance's canvas position.",
    }),
  removeComponentInstance: z
    .strictObject({
      instanceId: idSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Remove a component instance." }),
  addFusion: fusionSchema
    .extend({
      name: fusionSchema.shape.name.optional(),
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description:
        "Fuse a place of the net with ports of its component instances, or ports with each other, so they are one place in simulation. Without a `name`, the fusion is named `Fusion N`, with the lowest number no fusion of the net uses. A member already in another fusion of the same net brings that fusion's members along, and that fusion is removed.",
    }),
  updateFusion: z
    .strictObject({
      fusionId: idSchema,
      update: fusionUpdateSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description:
        "Rename a fusion or change its description. A fusion keeps a name: an empty one is refused.",
    }),
  removeFusion: z
    .strictObject({
      fusionId: idSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description: "Remove a fusion. Its members become separate places again.",
    }),
  addFusionMember: z
    .strictObject({
      fusionId: idSchema,
      member: fusionMemberSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description:
        "Add a place or an instance port to a fusion. A member already in another fusion of the same net brings that fusion's members along, and that fusion is removed.",
    }),
  removeFusionMember: z
    .strictObject({
      fusionId: idSchema,
      member: fusionMemberSchema,
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description:
        "Take a place or an instance port out of a fusion. A fusion left with fewer than two members is removed.",
    }),
  replaceFusionMember: z
    .strictObject({
      fusionId: idSchema,
      member: fusionMemberSchema.meta({
        description: "The member that leaves the fusion.",
      }),
      replacement: fusionMemberSchema.meta({
        description: "The place or instance port that joins in its stead.",
      }),
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description:
        "Move a fusion from one place or instance port to another, in one step. A replacement already in another fusion of the same net brings that fusion's members along, and that fusion is removed. The replacement must not be a member of this fusion already: use `removeFusionMember` to take a member out.",
    }),
  setImplementation: z
    .strictObject({
      interfaceId: idSchema.meta({
        description: "The ID of the interface, a component of the document.",
      }),
      implementationId: idSchema.nullable().meta({
        description:
          "The ID of the component to run for instances of the interface that choose none themselves, or null to clear the document's default.",
      }),
    })
    .meta({
      description:
        "Set or clear the document's default implementation for an interface.",
    }),
  deleteItemsByIds: z
    .strictObject({
      items: z.array(itemTypeAndIdSchema).meta({
        description: "Items to delete in one mutation.",
      }),
      targetComponentId: targetComponentIdSchema,
    })
    .meta({ description: "Delete selected SDCPN items by ID." }),
  commitNodePositions: z
    .strictObject({
      commits: z.array(nodePositionCommitSchema).meta({
        description: "Node positions to commit.",
      }),
      targetComponentId: targetComponentIdSchema,
    })
    .meta({
      description:
        "Commit multiple place, transition, or component instance positions.",
    }),
} as const;

export type PlaceInput = z.infer<typeof placeSchema>;
export type TransitionInput = z.infer<typeof transitionSchema>;
export type ColorInput = z.infer<typeof colorSchema>;
export type DifferentialEquationInput = z.infer<
  typeof differentialEquationSchema
>;
export type ParameterInput = z.infer<typeof parameterSchema>;
export type ScenarioInput = z.infer<typeof simulationScenarioSchema>;
export type MetricInput = z.infer<typeof simulationMetricSchema>;
export type ComponentInstanceInput = z.infer<typeof componentInstanceSchema>;
export type ComponentInput = z.infer<typeof componentSchema>;
export type FusionInput = z.infer<typeof fusionSchema>;
export type NodePositionCommitInput = z.infer<typeof nodePositionCommitSchema>;

export type MutationActionName = keyof typeof mutationActionInputSchemas;
export type MutationActionInput<Name extends MutationActionName> = z.infer<
  (typeof mutationActionInputSchemas)[Name]
>;

/**
 * The updates that, on some inputs, drop arcs and fusion memberships:
 * `updatePrunesReferences` says whether a call would.
 */
export const pruningUpdateActions = [
  "updatePlace",
  "updateComponentInstance",
] as const satisfies readonly MutationActionName[];
