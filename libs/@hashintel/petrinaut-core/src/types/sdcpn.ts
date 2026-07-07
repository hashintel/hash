export type ID = string;

export type ColorElementType =
  | "real"
  | "integer"
  | "boolean"
  | "uuid"
  | "string";

/**
 * Runtime value of one token attribute. `uuid` elements are represented as a
 * single `bigint` (0 ≤ v < 2^128) at runtime; at rest (documents, scenario
 * JSON) they are stored as canonical lowercase 36-character strings.
 * `string` elements are plain JS strings everywhere; frame buffers store
 * them as 64-bit references into a per-run string pool (see
 * `simulation/engine/string-pool.ts`).
 */
export type TokenAttributeValue = number | boolean | bigint | string;

export type TokenRecord = Record<string, TokenAttributeValue>;

export type InputArcType = "standard" | "inhibitor" | "read";

export type PlaceArcEndpoint = {
  kind: "place";
  placeId: ID;
};

export type ComponentPortArcEndpoint = {
  kind: "componentPort";
  /** ID of the component instance in the net containing the transition. */
  componentInstanceId: ID;
  /** ID of a port place inside the component instance's referenced subnet. */
  portPlaceId: ID;
};

export type ArcEndpoint = PlaceArcEndpoint | ComponentPortArcEndpoint;

type ArcEndpointReference = {
  /**
   * Legacy shorthand for a normal place endpoint. New code should prefer
   * `endpoint: { kind: "place", placeId }`, but this remains supported for
   * existing files and examples.
   */
  placeId?: ID;
  endpoint?: ArcEndpoint;
};

export type InputArc = ArcEndpointReference & {
  weight: number;
  type: InputArcType;
};

export type OutputArc = ArcEndpointReference & {
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
  /** When true, this place is exposed as a component port for subnet instances. */
  isPort?: boolean;
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
    type: ColorElementType;
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
  colorId: ID | null;
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
         * - token data rows for colored places (rows × elements). Row values
         *   are numbers/booleans; `uuid` columns are stored as canonical
         *   lowercase UUID strings so documents stay JSON-serializable.
         */
        type: "per_place";
        content: Record<ID, string | (number | boolean | string)[][]>;
      }
    | {
        /** Single code block that returns the full initial state object. */
        type: "code";
        content: string;
      };
};

/**
 * A metric is a user-authored function that takes the current simulation state
 * (places with token counts and, for colored places, named token attributes)
 * and returns a single number to be plotted over time on the timeline chart.
 */
export type Metric = {
  id: ID;
  name: string;
  description?: string;
  /**
   * Function body invoked with `state` in scope. Must `return` a number.
   * See `MetricState` (in `simulation/compile-metric.ts`) for the input shape.
   */
  code: string;
};

/**
 * An instance of a subnet placed inside another net.
 */
export type ComponentInstance = {
  id: ID;
  /** Display name for this instance. */
  name: string;
  /** ID of the subnet this instance instantiates. */
  subnetId: ID;
  /**
   * Concrete values for the subnet's parameters.
   * Keys are parameter IDs from the referenced subnet; values are expressions.
   */
  parameterValues: Record<ID, string>;
  // UI positioning
  x: number;
  y: number;
};

export type Subnet = {
  id: ID;
  name: string;
  places: Place[];
  transitions: Transition[];
  types: Color[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
  componentInstances?: ComponentInstance[];
};

export type SDCPN = {
  places: Place[];
  transitions: Transition[];
  types: Color[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
  scenarios?: Scenario[];
  metrics?: Metric[];
  subnets?: Subnet[];
  componentInstances?: ComponentInstance[];
};

export type MinimalNetMetadata = {
  netId: string;
  title: string;
  lastUpdated: string;
};

export type MutateSDCPN = (mutateFn: (sdcpn: SDCPN) => void) => void;
