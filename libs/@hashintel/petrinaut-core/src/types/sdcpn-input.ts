import type {
  Color,
  DifferentialEquation,
  ID,
  InputArcType,
  Metric,
  Parameter,
  Scenario,
  SDCPN,
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
};

export type SDCPNPlaceInput = {
  id: ID;
  name: string;
  x: number;
  y: number;
  /** @default null */
  colorId?: ID | null;
  /** @default false */
  dynamicsEnabled?: boolean;
  /** @default null */
  differentialEquationId?: ID | null;
  visualizerCode?: string;
  showAsInitialState?: boolean;
};

export type SDCPNInputArcInput = {
  placeId: string;
  /** @default 1 */
  weight?: number;
  /** @default "standard" */
  type?: InputArcType;
};

export type SDCPNOutputArcInput = {
  placeId: string;
  /** @default 1 */
  weight?: number;
};

export type SDCPNTransitionInput = {
  id: ID;
  name: string;
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
 * Fill plain-net defaults into an {@link SDCPNInput} to produce a canonical
 * {@link SDCPN}. Idempotent: normalizing an already-complete `SDCPN` returns an
 * equivalent value.
 *
 * Optional output fields (`visualizerCode`, `showAsInitialState`, `scenarios`,
 * `metrics`) are only set when present on the input, so the result matches the
 * shape the editor itself produces (relevant for structural dirty-tracking via
 * `isSDCPNEqual`).
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
      if (place.visualizerCode !== undefined) {
        normalized.visualizerCode = place.visualizerCode;
      }
      if (place.showAsInitialState !== undefined) {
        normalized.showAsInitialState = place.showAsInitialState;
      }
      return normalized;
    }),
    transitions: input.transitions.map((transition) => ({
      id: transition.id,
      name: transition.name,
      inputArcs: transition.inputArcs.map((arc) => ({
        placeId: arc.placeId,
        weight: arc.weight ?? 1,
        type: arc.type ?? "standard",
      })),
      outputArcs: transition.outputArcs.map((arc) => ({
        placeId: arc.placeId,
        weight: arc.weight ?? 1,
      })),
      lambdaType: transition.lambdaType ?? "predicate",
      lambdaCode: transition.lambdaCode ?? "",
      transitionKernelCode: transition.transitionKernelCode ?? "",
      x: transition.x,
      y: transition.y,
    })),
    types: input.types ?? [],
    parameters: input.parameters ?? [],
    differentialEquations: input.differentialEquations ?? [],
  };

  if (input.scenarios !== undefined) {
    result.scenarios = input.scenarios;
  }
  if (input.metrics !== undefined) {
    result.metrics = input.metrics;
  }

  return result;
}
