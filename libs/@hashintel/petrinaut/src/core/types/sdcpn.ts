export type ID = string;

export type InputArc = {
  placeId: string;
  weight: number;
  type: "standard" | "inhibitor";
};

export type OutputArc = {
  placeId: string;
  weight: number;
};

export type Transition = {
  id: ID;
  name: string;
  inputArcs: InputArc[];
  outputArcs: OutputArc[];
  lambdaType: "predicate" | "stochastic";
  lambdaCode: string;
  transitionKernelCode: string;
  // UI positioning
  x: number;
  y: number;
};

export type Place = {
  id: ID;
  name: string;
  colorId: null | ID;
  dynamicsEnabled: boolean;
  differentialEquationId: null | ID;
  visualizerCode?: string;
  showAsInitialState?: boolean;
  // UI positioning
  x: number;
  y: number;
};

export type Color = {
  id: ID;
  name: string;
  iconSlug: string; // e.g., "circle", "square"
  displayColor: string; // e.g., "#FF0000"
  elements: {
    elementId: string;
    name: string;
    type: "real" | "integer" | "boolean";
  }[];
};

export type Parameter = {
  id: ID;
  name: string;
  variableName: string;
  type: "real" | "integer" | "boolean";
  defaultValue: string;
};

export type DifferentialEquation = {
  id: ID;
  name: string;
  colorId: ID;
  code: string;
};

/**
 * A parameter scoped to a specific scenario (distinct from net-level Parameters).
 */
export type ScenarioParameter = {
  type: "real" | "integer" | "boolean" | "ratio";
  identifier: string;
  default: number;
};

/**
 * A scenario defines a reusable configuration for simulating an SDCPN.
 *
 * It can introduce its own parameters, override values of existing net-level
 * parameters, and specify the initial token state for each place.
 */
export type Scenario = {
  id: ID;
  name: string;
  description?: string;
  /** Parameters that only exist within this scenario. */
  scenarioParameters: ScenarioParameter[];
  /**
   * Overrides for existing net-level parameters.
   * Keys are parameter IDs from the SDCPN; values are concrete values or
   * expressions (expression support will be added later).
   */
  parameterOverrides: Record<ID, string>;
  /**
   * Initial token state definition. Either per-place expressions or a single
   * code block that returns an object mapping place names to token arrays.
   */
  initialState:
    | {
        /**
         * Per-place initial state. Values are either:
         * - `string`: expression for uncolored places (evaluates to token count)
         * - `number[][]`: token data for colored places (rows × elements)
         */
        type: "per_place";
        content: Record<ID, string | number[][]>;
      }
    | {
        /** Single code block that returns the full initial state object. */
        type: "code";
        content: string;
      };
};

export type SDCPN = {
  places: Place[];
  transitions: Transition[];
  types: Color[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
  scenarios?: Scenario[];
};

export type MinimalNetMetadata = {
  netId: string;
  title: string;
  lastUpdated: string;
};

export type MutateSDCPN = (mutateFn: (sdcpn: SDCPN) => void) => void;
