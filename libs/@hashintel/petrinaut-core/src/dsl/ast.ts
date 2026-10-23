/**
 * The declarations the DSL parser reads: the printer's output taken back,
 * with the source range of every declaration and every name, so a diagnostic
 * can point at the text it is about. Names are plain strings; the ids and
 * positions of a document belong to the merge that matches them.
 */

import type {
  ColorElementType,
  ComponentSource,
  InputArcType,
  Parameter,
  PortDirection,
  ScenarioParameter,
} from "../types/sdcpn";

/** A region of the text: 1-based lines and columns, the end exclusive. */
export type DslRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type DslDiagnosticSeverity = "error" | "warning";

export type DslDiagnostic = {
  severity: DslDiagnosticSeverity;
  message: string;
  range: DslRange;
};

/** A name or keyword with the range it was read from. */
export type DslWord = {
  text: string;
  range: DslRange;
};

/** `Name`, a place of the scope, or `Instance.Port`, a port of one of its instances. */
export type DslPlaceReference = {
  instance: DslWord | null;
  place: DslWord;
  range: DslRange;
};

type Declared = {
  range: DslRange;
  description?: string;
};

export type DslTypeElement = {
  name: DslWord;
  type: ColorElementType;
};

export type DslTypeDeclaration = Declared & {
  name: DslWord;
  elements: DslTypeElement[];
};

export type DslParameterDeclaration = Declared & {
  variableName: DslWord;
  /** The label when the text spells one; the merge keeps or derives it otherwise. */
  label: string | null;
  type: Parameter["type"];
  defaultValue: string;
};

export type DslDynamicsDeclaration = Declared & {
  name: DslWord;
  type: DslWord | null;
  code: string;
};

export type DslPlaceDeclaration = Declared & {
  name: DslWord;
  /** The direction when the declaration is a `port`, `null` for a `place`. */
  port: PortDirection | null;
  type: DslWord | null;
  capacity: number | null;
  dynamics: DslWord | null;
  start: boolean;
  visualizer: string | null;
};

/** `name = value`: a parameter binding, an override or a marking entry. */
export type DslBinding = {
  name: DslWord;
  value: string;
  range: DslRange;
};

export type DslInstanceDeclaration = Declared & {
  name: DslWord;
  component: DslWord;
  bindings: DslBinding[];
};

export type DslFusionDeclaration = Declared & {
  name: DslWord | null;
  members: DslPlaceReference[];
};

export type DslArc = {
  weight: number;
  type: InputArcType;
  target: DslPlaceReference;
  range: DslRange;
};

export type DslTransitionDeclaration = Declared & {
  name: DslWord;
  inputs: DslArc[];
  outputs: DslArc[];
  lambda: { type: "stochastic" | "predicate"; code: string } | null;
  kernel: string | null;
};

export type DslMetricDeclaration = Declared & {
  name: DslWord;
  code: string;
};

export type DslScenarioParameter = {
  identifier: DslWord;
  type: ScenarioParameter["type"];
  default: number;
  range: DslRange;
};

export type DslInitialState =
  | { kind: "code"; code: string }
  | { kind: "marking"; entries: DslBinding[] };

export type DslScenarioDeclaration = Declared & {
  name: DslWord;
  parameters: DslScenarioParameter[];
  overrides: DslBinding[];
  initial: DslInitialState | null;
};

/** The declarations a net or a component holds, each kind in text order. */
export type DslScope = {
  types: DslTypeDeclaration[];
  parameters: DslParameterDeclaration[];
  dynamics: DslDynamicsDeclaration[];
  places: DslPlaceDeclaration[];
  instances: DslInstanceDeclaration[];
  fusions: DslFusionDeclaration[];
  transitions: DslTransitionDeclaration[];
};

export type DslComponentDeclaration = DslScope &
  Declared & {
    name: DslWord;
    source: ComponentSource | null;
  };

export type DslDocument = DslScope & {
  range: DslRange;
  description?: string;
  /** The title on the `net` line, `null` when the line has none. */
  title: string | null;
  componentsOnly: boolean;
  components: DslComponentDeclaration[];
  metrics: DslMetricDeclaration[];
  scenarios: DslScenarioDeclaration[];
};

export const emptyDslScope = (): DslScope => ({
  types: [],
  parameters: [],
  dynamics: [],
  places: [],
  instances: [],
  fusions: [],
  transitions: [],
});
