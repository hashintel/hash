import type {
  ArcEndpoint,
  Color,
  ComponentInstance,
  DifferentialEquation,
  ID,
  InputArc,
  InputArcType,
  Metric,
  OutputArc,
  Parameter,
  Scenario,
  SDCPN,
  Subnet,
  Transition,
} from "./sdcpn";

/**
 * Loose, authoring-friendly variant of {@link SDCPN}.
 *
 * The canonical {@link SDCPN} type is what the editor, simulation, LSP, and
 * serialization consume, so every extension field is present on it. When a
 * host integrates Petrinaut and maps its own domain model into a Petri net, it
 * usually doesn't care about colours, dynamics, stochasticity, or parameters —
 * yet the strict type still forces it to spell out `colorId: null`,
 * `lambdaCode: ""`, empty `types`/`parameters`/`differentialEquations` arrays,
 * and so on for every node.
 *
 * `SDCPNInput` makes all of that optional. Pass it to
 * {@link normalizeSDCPN} (or straight to `createJsonDocHandle`, which
 * normalizes internally) to get a fully-populated {@link SDCPN} with plain-net
 * defaults filled in. A complete {@link SDCPN} is always a valid `SDCPNInput`,
 * so existing callers are unaffected.
 */
export type SDCPNInput = {
  description?: string;
  metadata?: SDCPN["metadata"];
  places: SDCPNPlaceInput[];
  transitions: SDCPNTransitionInput[];
  /** @default [] */
  types?: Color[];
  /** @default [] */
  parameters?: Parameter[];
  /** @default [] */
  differentialEquations?: DifferentialEquation[];
  scenarios?: Scenario[];
  metrics?: Metric[];
  subnets?: Subnet[];
  componentInstances?: ComponentInstance[];
};

export type SDCPNPlaceInput = {
  id: ID;
  name: string;
  description?: string;
  x: number;
  y: number;
  /** @default null */
  colorId?: ID | null;
  /** @default false */
  dynamicsEnabled?: boolean;
  /** @default null */
  differentialEquationId?: ID | null;
  isPort?: boolean;
  visualizerCode?: string;
  showAsInitialState?: boolean;
};

/**
 * Arc target: either the `placeId` shorthand for a normal place endpoint, or
 * an explicit {@link ArcEndpoint} (required for component ports). Provide one
 * of the two.
 */
export type SDCPNArcEndpointInput = {
  placeId?: ID;
  endpoint?: ArcEndpoint;
};

export type SDCPNInputArcInput = SDCPNArcEndpointInput & {
  /** @default 1 */
  weight?: number;
  /** @default "standard" */
  type?: InputArcType;
};

export type SDCPNOutputArcInput = SDCPNArcEndpointInput & {
  /** @default 1 */
  weight?: number;
};

export type SDCPNTransitionInput = {
  id: ID;
  name: string;
  description?: string;
  metadata?: Transition["metadata"];
  inputArcs: SDCPNInputArcInput[];
  outputArcs: SDCPNOutputArcInput[];
  x: number;
  y: number;
  /** @default "predicate" */
  lambdaType?: "predicate" | "stochastic";
  /** @default "" */
  lambdaCode?: string;
  /** @default "" */
  transitionKernelCode?: string;
};

/**
 * Pick the endpoint fields that are present, so normalized arcs carry exactly
 * the keys the input had (relevant for structural equality).
 */
function arcEndpointFields(arc: SDCPNArcEndpointInput): SDCPNArcEndpointInput {
  const fields: SDCPNArcEndpointInput = {};
  if (arc.placeId !== undefined) {
    fields.placeId = arc.placeId;
  }
  if (arc.endpoint !== undefined) {
    fields.endpoint = arc.endpoint;
  }
  return fields;
}

/**
 * Fill plain-net defaults into an {@link SDCPNInput} to produce a canonical
 * {@link SDCPN}. Idempotent: normalizing an already-complete `SDCPN` returns an
 * equivalent value.
 *
 * Optional output fields (`isPort`, `visualizerCode`, `showAsInitialState`,
 * arc `placeId`/`endpoint`, `scenarios`, `metrics`, `subnets`,
 * `componentInstances`) are only set when present on the input, so the result
 * matches the shape the editor itself produces (relevant for structural
 * dirty-tracking via `isSDCPNEqual`).
 */
export function normalizeSDCPN(input: SDCPNInput): SDCPN {
  const result: SDCPN = {
    places: input.places.map((place) => {
      const normalized: SDCPN["places"][number] = {
        id: place.id,
        name: place.name,
        colorId: place.colorId ?? null,
        dynamicsEnabled: place.dynamicsEnabled ?? false,
        differentialEquationId: place.differentialEquationId ?? null,
        x: place.x,
        y: place.y,
      };
      if (place.description !== undefined) {
        normalized.description = place.description;
      }
      if (place.isPort !== undefined) {
        normalized.isPort = place.isPort;
      }
      if (place.visualizerCode !== undefined) {
        normalized.visualizerCode = place.visualizerCode;
      }
      if (place.showAsInitialState !== undefined) {
        normalized.showAsInitialState = place.showAsInitialState;
      }
      return normalized;
    }),
    transitions: input.transitions.map((transition) => {
      const normalized: SDCPN["transitions"][number] = {
        id: transition.id,
        name: transition.name,
        inputArcs: transition.inputArcs.map(
          (arc): InputArc => ({
            ...arcEndpointFields(arc),
            weight: arc.weight ?? 1,
            type: arc.type ?? "standard",
          }),
        ),
        outputArcs: transition.outputArcs.map(
          (arc): OutputArc => ({
            ...arcEndpointFields(arc),
            weight: arc.weight ?? 1,
          }),
        ),
        lambdaType: transition.lambdaType ?? "predicate",
        lambdaCode: transition.lambdaCode ?? "",
        transitionKernelCode: transition.transitionKernelCode ?? "",
        x: transition.x,
        y: transition.y,
      };
      if (transition.description !== undefined) {
        normalized.description = transition.description;
      }
      if (transition.metadata !== undefined) {
        normalized.metadata = transition.metadata;
      }
      return normalized;
    }),
    types: input.types ?? [],
    parameters: input.parameters ?? [],
    differentialEquations: input.differentialEquations ?? [],
  };

  if (input.description !== undefined) {
    result.description = input.description;
  }
  if (input.metadata !== undefined) {
    result.metadata = input.metadata;
  }
  if (input.scenarios !== undefined) {
    result.scenarios = input.scenarios;
  }
  if (input.metrics !== undefined) {
    result.metrics = input.metrics;
  }
  if (input.subnets !== undefined) {
    result.subnets = input.subnets;
  }
  if (input.componentInstances !== undefined) {
    result.componentInstances = input.componentInstances;
  }

  return result;
}
