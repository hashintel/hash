/**
 * @layerRoot core.types
 * @role The canonical TypeScript types describing an SDCPN document
 */

export type ID = string;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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
  description?: string;
  /** Host-defined data, opaque to Petrinaut. */
  metadata?: Record<string, JsonValue>;
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
  description?: string;
  colorId: null | ID;
  dynamicsEnabled: boolean;
  differentialEquationId: null | ID;
  /**
   * Optional maximum number of tokens this place will hold.
   *
   * A transition whose firing would take this place past its capacity is not
   * enabled — the same way a transition without enough input tokens is not
   * enabled — so a full place blocks the transitions that feed it and the limit
   * is never exceeded. Evaluated on the net change per firing, so a transition
   * that both consumes from and produces into this place is not blocked by its
   * own output.
   *
   * `null` or absent means unbounded.
   */
  capacity?: number | null;
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
  description?: string;
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

// -- Ad-hoc scenario definitions ---------------------------------------------
//
// The editing state of the ad-hoc scenario form. A persisted scenario may
// carry one of these as its initial state, which makes the shapes document
// types; the behaviour around them (transitions, actions, synthesis) lives
// in `simulation/authoring/scenario/ad-hoc/`.

/** Optimization settings for one Optimize toggle, kept while toggled off. */
export type AdHocOptimizeSettings = {
  /** Lower bound; an expression that must resolve to a constant. */
  min: string;
  /** Upper bound; an expression that must resolve to a constant. */
  max: string;
  scale: "linear" | "log";
  /** Integer domains only; an expression resolving to a positive integer. */
  step?: string;
};

/**
 * One value-carrying slot. `expression` is always kept, so toggling Optimize
 * on and off never destroys what the user typed.
 */
export type AdHocValue = {
  expression: string;
  /** Non-null while the Optimize toggle is on. */
  optimize: AdHocOptimizeSettings | null;
  /**
   * The settings from the last time Optimize was on, kept while it is off so
   * toggling it back restores the previous bounds. Ignored by synthesis.
   */
  retainedOptimize?: AdHocOptimizeSettings;
};

export type AdHocVariable = AdHocValue & {
  /**
   * A bare JavaScript identifier. Top-level Variables are referenced as
   * `scenario.<name>`; per-place Variables by the bare name.
   */
  name: string;
  type: "real" | "integer" | "boolean";
  /**
   * Exposed as a scenario parameter (top-level Variables only): the
   * synthesized scenario declares a parameter named after the Variable,
   * defaulting to the expression's value — which must resolve to a
   * constant — and the Variable reads that parameter at run time, so
   * consumers adjust it per run. When the same Variable is also optimized
   * in an optimization synthesis, Optimize wins and no exposed parameter
   * is emitted.
   */
  exposed?: boolean;
};

/**
 * One spreadsheet row. A fixed row emits one token. A dynamic ("template")
 * row emits its count's worth of tokens, the cells evaluated once per `i`;
 * the count may itself be optimized. The kinds mix freely within a place and
 * cycle from the row gutter: Fixed → Dynamic → count-Optimized → Fixed.
 */
export type AdHocRow =
  | {
      kind: "fixed";
      cells: AdHocValue[];
      /** The count from the row's last dynamic stint, restored on cycling. */
      retainedCount?: AdHocValue;
    }
  | { kind: "template"; count: AdHocValue; cells: AdHocValue[] };

export type AdHocColouredPlace = {
  kind: "coloured";
  variables: AdHocVariable[];
  rows: AdHocRow[];
  /**
   * Shared column values, keyed by colour element name. A shared column's
   * value supersedes every cell in that column: the cells' own states are
   * kept (so un-sharing restores them exactly) but not evaluated and not
   * emitted as parameters while the share is in place.
   */
  sharedColumns: Record<string, AdHocValue>;
  /**
   * Shared values from columns that were un-shared, kept so re-sharing
   * restores the most recent shared value. Ignored by synthesis.
   */
  retainedSharedColumns?: Record<string, AdHocValue>;
};

export type AdHocUncolouredPlace = {
  kind: "uncoloured";
  /** Token count for the place. */
  count: AdHocValue;
};

export type AdHocPlaceState = AdHocColouredPlace | AdHocUncolouredPlace;

export type AdHocNetParameter = AdHocValue & {
  /** `Parameter.id` of the net parameter this entry overrides. */
  parameterId: string;
};

export type AdHocScenarioState = {
  /**
   * Top-level Variables, referenced as `scenario.<name>`; they stand in for
   * scenario parameters in this form.
   */
  variables: AdHocVariable[];
  /** Overrides for net parameters; empty expression keeps the default. */
  netParameters: AdHocNetParameter[];
  /** Keyed by `Place.id`; places absent here keep an empty initial state. */
  places: Record<string, AdHocPlaceState>;
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
      }
    | {
        /**
         * An ad-hoc definition authored with the in-app form: expressions per
         * cell, Variables at two scopes, dynamic rows, shared columns. The
         * scenario's `scenarioParameters` (from exposed Variables) and
         * `parameterOverrides` (from the definition's parameter entries) are
         * DERIVED from this state on save and stay authoritative for
         * compilation; the stored state is the editable source. Compilation
         * synthesizes the initial state to code-mode source.
         */
        type: "adhoc";
        content: AdHocScenarioState;
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
   * `state.places.<Name>` exposes `count` and a typed `tokens` array per
   * place; the body is compiled through the HIR (`buildMetricContext`).
   */
  code: string;
};

/**
 * One named status within a status view, mapped to the places whose tokens
 * carry it. Labels are many-to-one: several places can map to the same label.
 */
export type StatusLabel = {
  id: ID;
  name: string;
  /** CSS colour used for the label's badge, tint, and Kanban column. */
  displayColor: string;
  /**
   * Places whose tokens carry this label. A componentInstance's copy of a
   * subnet place is addressed by scoped id (`instanceId::placeId`, see
   * `scoped-ids.ts`). Empty for an exit label.
   */
  places: ID[];
  /**
   * Optional boolean expression over the token's attributes; the label
   * applies only while the token is in the label's places AND the
   * expression holds.
   */
  tokenCondition?: string;
  /**
   * Marks the view's exit label, assigned to an instance whose token has
   * left every place of the view's labels. At most one per view, and it
   * has no places.
   */
  isExit?: boolean;
};

/**
 * A user-defined mapping from net state to named statuses for the instances
 * of one identity: which label each tracked instance carries is derived from
 * where its token sits (and the labels' token conditions), never stored.
 */
export type StatusView = {
  id: ID;
  name: string;
  description?: string;
  /** Id of the Identity this view tracks. */
  identityRef: ID;
  /**
   * Position in this array is the label's order: the Kanban column
   * position and the legend position.
   */
  labels: StatusLabel[];
};

/**
 * An instance of a subnet placed inside another net.
 */
export type ComponentInstance = {
  id: ID;
  /** Display name for this instance. */
  name: string;
  description?: string;
  /** Host-defined data, opaque to Petrinaut. */
  metadata?: Record<string, JsonValue>;
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
  description?: string;
  /** Host-defined data, opaque to Petrinaut. */
  metadata?: Record<string, JsonValue>;
  places: Place[];
  transitions: Transition[];
  types: Color[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
  componentInstances?: ComponentInstance[];
};

export type SDCPN = {
  description?: string;
  /** Host-defined data, opaque to Petrinaut. */
  metadata?: Record<string, JsonValue>;
  places: Place[];
  transitions: Transition[];
  types: Color[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
  scenarios?: Scenario[];
  metrics?: Metric[];
  statusViews?: StatusView[];
  subnets?: Subnet[];
  componentInstances?: ComponentInstance[];
};

export type MinimalNetMetadata = {
  netId: string;
  title: string;
  lastUpdated: string;
};

export type MutateSDCPN = (mutateFn: (sdcpn: SDCPN) => void) => void;
