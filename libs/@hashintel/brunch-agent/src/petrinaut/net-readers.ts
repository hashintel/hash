import * as v from "valibot";

import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import type {
  AdHocOptimizeSettings,
  AdHocPlaceState,
  AdHocRow,
  AdHocScenarioState,
  AdHocValue,
  ComponentInstance,
  DifferentialEquation,
  Metric,
  Scenario,
  SDCPN,
  Subnet,
  Transition,
} from "@hashintel/petrinaut-core";

/** Filtered views of `getLatestNetDefinition`, executed by the bound browser. */
export const netReaderToolNames = {
  outline: "readNetOutline",
  structure: "readNetStructure",
} as const;

export type NetReaderLevel = keyof typeof netReaderToolNames;

export const netReaderInputSchema = v.strictObject({});

export const parseNetReaderInput = (value: unknown) =>
  v.parse(netReaderInputSchema, value);

export const netReaderDescriptions: Record<NetReaderLevel, string> = {
  outline:
    "Read a compact outline of the current net: ids, names and core properties of places, transitions with their input and output arcs, token types, parameters, equations, scenarios, metrics, subnets and component instances. Code and expressions are left out: lambda, kernel, equation and metric code, parameter overrides, component parameter values, and scenario initial states other than the shape of an ad-hoc one. Canvas positions, visual settings and host metadata are left out too. Returns { title, definition, extensions }.",
  structure:
    "Read the current net's structure with every core property, including lambda, kernel, equation, scenario and metric code. Canvas positions, visualizer code, icons, colours and host metadata are left out. Returns { title, definition, extensions }.",
};

export const netReaderLevelOf = (
  toolName: string,
): NetReaderLevel | undefined =>
  toolName === netReaderToolNames.outline
    ? "outline"
    : toolName === netReaderToolNames.structure
      ? "structure"
      : undefined;

/** Tools whose settled result shows the model the net's current structure. */
export const isNetObservationTool = (toolName: string): boolean =>
  toolName === getLatestNetDefinitionToolName ||
  netReaderLevelOf(toolName) !== undefined;

type Projection = (value: unknown) => unknown;

/** How one named field is copied: left out, or projected. */
type FieldRule = "omit" | Projection;

/** Every key of every member of a union, so a rule may name a field any member has. */
type KeyOf<Owner> = Owner extends unknown ? keyof Owner & string : never;

/**
 * Rules keyed by the fields of the petrinaut-core type that owns them, so a
 * renamed or removed field fails to compile instead of silently passing
 * through. A rule set must name its owner: without one, no key is allowed.
 */
type FieldRules<Owner> = Readonly<Partial<Record<KeyOf<Owner>, FieldRule>>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Copies an object applying `rules` to its own fields; other fields pass through. */
const projectObject = <Owner>(
  value: unknown,
  rules: FieldRules<Owner>,
): unknown => {
  if (!isRecord(value)) return value;
  const byKey: Readonly<Record<string, FieldRule | undefined>> = rules;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, member]) => {
      const rule = Object.hasOwn(byKey, key) ? byKey[key] : undefined;
      if (rule === "omit") return [];
      return [[key, rule ? rule(member) : member]];
    }),
  );
};

const eachItem =
  (project: Projection): Projection =>
  (value) =>
    Array.isArray(value) ? value.map(project) : value;

/** Projects every value of a record whose keys are user or entity names. */
const eachValue =
  (project: Projection): Projection =>
  (value) =>
    isRecord(value)
      ? Object.fromEntries(
          Object.entries(value).map(([key, member]) => [key, project(member)]),
        )
      : value;

const omitAll = <Owner>(keys: readonly KeyOf<Owner>[]): FieldRules<Owner> =>
  Object.fromEntries(keys.map((key) => [key, "omit"])) as FieldRules<Owner>;

/** Left out of the net and of each item in its collections, never deeper. */
const presentationalFields = [
  "x",
  "y",
  "visualizerCode",
  "showAsInitialState",
  "iconSlug",
  "displayColor",
  "metadata",
] as const satisfies readonly KeyOf<SDCPN | Subnet | NetItem>[];

type PresentationalField = (typeof presentationalFields)[number];

const presentationalRules = omitAll<SDCPN | Subnet | NetItem>(
  presentationalFields,
);

const adHocBoundsOutline = (settings: unknown) =>
  projectObject(
    settings,
    omitAll<AdHocOptimizeSettings>(["min", "max", "step"]),
  );

/** An `AdHocValue`, or a Variable or net parameter built on one, without its expressions. */
const adHocValueOutline = (value: unknown) =>
  projectObject<AdHocValue>(value, {
    expression: "omit",
    optimize: adHocBoundsOutline,
    retainedOptimize: adHocBoundsOutline,
  });

const adHocRowOutline = (row: unknown) =>
  projectObject<AdHocRow>(row, {
    cells: eachItem(adHocValueOutline),
    count: adHocValueOutline,
    retainedCount: adHocValueOutline,
  });

const adHocPlaceOutline = (place: unknown) =>
  projectObject<AdHocPlaceState>(place, {
    variables: eachItem(adHocValueOutline),
    rows: eachItem(adHocRowOutline),
    count: adHocValueOutline,
    sharedColumns: eachValue(adHocValueOutline),
    retainedSharedColumns: eachValue(adHocValueOutline),
  });

const adHocStateOutline = (state: unknown) =>
  projectObject<AdHocScenarioState>(state, {
    variables: eachItem(adHocValueOutline),
    netParameters: eachItem(adHocValueOutline),
    places: eachValue(adHocPlaceOutline),
  });

type InitialState = Scenario["initialState"];

/** Ad-hoc states keep their shape; code and per-place states keep only their type. */
const initialStateOutline = (state: unknown) => {
  switch (isRecord(state) ? state.type : undefined) {
    case "adhoc" satisfies InitialState["type"]:
      return projectObject<InitialState>(state, { content: adHocStateOutline });
    case "code" satisfies InitialState["type"]:
    case "per_place" satisfies InitialState["type"]:
      return projectObject<InitialState>(state, { content: "omit" });
    default:
      return state;
  }
};

/** Item collections of a net or subnet, apart from `subnets` themselves. */
const itemCollections = [
  "places",
  "transitions",
  "types",
  "differentialEquations",
  "parameters",
  "scenarios",
  "metrics",
  "componentInstances",
] as const satisfies readonly (keyof SDCPN)[];

type ItemCollection = (typeof itemCollections)[number];

type NetItem = NonNullable<SDCPN[ItemCollection]>[number];

/** Code and expression fields the outline also leaves out, by collection. */
const outlineItemRules: {
  readonly [Collection in ItemCollection]?: FieldRules<
    NonNullable<SDCPN[Collection]>[number]
  >;
} = {
  transitions: omitAll<Transition>(["lambdaCode", "transitionKernelCode"]),
  differentialEquations: omitAll<DifferentialEquation>(["code"]),
  scenarios: { parameterOverrides: "omit", initialState: initialStateOutline },
  metrics: omitAll<Metric>(["code"]),
  componentInstances: omitAll<ComponentInstance>(["parameterValues"]),
};

type WithoutPresentation<Item> = Item extends unknown
  ? Omit<Item, PresentationalField>
  : never;

type ItemsWithoutPresentation<Items> = Items extends readonly (infer Item)[]
  ? WithoutPresentation<Item>[]
  : Items;

type CollectionsOf<Net> = Pick<Net, ItemCollection & keyof Net>;

type StructureOf<Net> = Omit<
  Net,
  PresentationalField | ItemCollection | "subnets"
> & {
  [Collection in keyof CollectionsOf<Net>]: ItemsWithoutPresentation<
    CollectionsOf<Net>[Collection]
  >;
};

/** A net at the `structure` level: every core field, without presentational ones. */
export type NetStructure = StructureOf<SDCPN> & {
  subnets?: StructureOf<Subnet>[];
};

/**
 * Drop presentational fields from the net, its subnets and the items of their
 * collections; the outline also drops code and expressions. Fields are matched
 * by their place in the net, so user-named keys such as an ad-hoc scenario's
 * shared columns are never mistaken for them, and fields not named here pass
 * through, so new core fields appear without changes here.
 */
export const projectNetDefinition = (
  value: unknown,
  level: NetReaderLevel,
): unknown =>
  projectObject<SDCPN | Subnet>(value, {
    ...presentationalRules,
    ...Object.fromEntries(
      itemCollections.map((collection) => {
        const itemRules: FieldRules<NetItem> = {
          ...presentationalRules,
          ...(level === "outline" ? outlineItemRules[collection] : {}),
        };
        return [collection, eachItem((item) => projectObject(item, itemRules))];
      }),
    ),
    subnets: eachItem((subnet) => projectNetDefinition(subnet, level)),
  });

/** The net's structure, as `readNetStructure` and a change's read-back show it. */
export const netStructureOf = (definition: SDCPN): NetStructure =>
  projectNetDefinition(definition, "structure") as NetStructure;
