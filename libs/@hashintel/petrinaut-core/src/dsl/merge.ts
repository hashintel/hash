/**
 * Writes parsed declarations onto a document: the half of the round trip
 * that makes the DSL editable. A declaration is matched to the document's
 * entity of the same name in the same scope, so a matched entity keeps its
 * id, its position and the fields the text does not write; an unmatched
 * declaration is a new entity, and an entity the text no longer declares is
 * gone. References are resolved by name too, and each that fails is a
 * diagnostic at its text.
 */

import {
  createArcEndpointReference,
  getArcEndpoint,
  getArcEndpointKey,
} from "../arc-endpoints";
import { inferPortDirection } from "../composition/ports";
import { GRID_SIZE } from "../grid-size";
import { nextTypeColor } from "../lib/type-colors";
import { generatePetrinautId } from "../petrinaut-id";
import { plainWords } from "./identifiers";

import type {
  ArcEndpoint,
  Color,
  ComponentInstance,
  DifferentialEquation,
  Fusion,
  InputArc,
  Metric,
  OutputArc,
  Parameter,
  Place,
  Scenario,
  SDCPN,
  Subnet,
  Transition,
} from "../types/sdcpn";
import type {
  DslBinding,
  DslComponentDeclaration,
  DslDiagnostic,
  DslDocument,
  DslFusionDeclaration,
  DslPlaceReference,
  DslRange,
  DslScope,
  DslWord,
} from "./ast";

export type DslMergeOptions = {
  /** Mints the id of a new entity; a test passes a predictable one. */
  generateId?: () => string;
};

export type DslMergeResult =
  | { ok: true; sdcpn: SDCPN; diagnostics: DslDiagnostic[] }
  | { ok: false; diagnostics: DslDiagnostic[] };

type Merge = {
  generateId: () => string;
  diagnostics: DslDiagnostic[];
};

const fail = (merge: Merge, message: string, range: DslRange): null => {
  merge.diagnostics.push({ severity: "error", message, range });
  return null;
};

/** `{ description }` when the text has one, else the document's when that is blank, else nothing. */
const descriptionOf = (
  declaration: { description?: string },
  existing: { description?: string } | null,
): { description?: string } => {
  if (declaration.description !== undefined) {
    return { description: declaration.description };
  }
  if (
    existing?.description !== undefined &&
    existing.description.trim() === ""
  ) {
    return { description: existing.description };
  }
  return {};
};

const metadataOf = (
  existing: { metadata?: Record<string, unknown> } | null,
): { metadata?: SDCPN["metadata"] } =>
  existing?.metadata === undefined
    ? {}
    : { metadata: existing.metadata as SDCPN["metadata"] };

type Pair<Declaration, Entity> = {
  declaration: Declaration;
  existing: Entity | null;
};

/**
 * Pairs each declaration with the entity of its name. A lone declaration
 * without a match beside a lone entity the text dropped is a rename, and
 * they pair too. A name declared twice is an error, and the second stays
 * unpaired.
 */
const matchByName = <Declaration, Entity>(
  merge: Merge,
  declarations: readonly Declaration[],
  entities: readonly Entity[],
  nameOf: (declaration: Declaration) => DslWord,
  entityName: (entity: Entity) => string,
  what: string,
): Pair<Declaration, Entity>[] => {
  const byName = new Map(
    entities.map((entity) => [entityName(entity), entity]),
  );
  const claimed = new Set<Entity>();
  const seen = new Set<string>();
  const pairs = declarations.map((declaration): Pair<Declaration, Entity> => {
    const name = nameOf(declaration);
    if (seen.has(name.text)) {
      fail(merge, `${what} "${name.text}" is declared twice`, name.range);
      return { declaration, existing: null };
    }
    seen.add(name.text);
    const existing = byName.get(name.text) ?? null;
    if (existing !== null) {
      claimed.add(existing);
    }
    return { declaration, existing };
  });
  const unmatched = pairs.filter((pair) => pair.existing === null);
  const dropped = entities.filter((entity) => !claimed.has(entity));
  if (unmatched.length === 1 && dropped.length === 1) {
    unmatched[0]!.existing = dropped[0]!;
  }
  return pairs;
};

type NetEntities = Pick<
  SDCPN,
  | "places"
  | "transitions"
  | "types"
  | "differentialEquations"
  | "parameters"
  | "componentInstances"
  | "fusions"
>;

/** Where the next new node of a scope goes: a row under the scope's nodes. */
const positionAllocator = (
  existing: NetEntities | null,
): (() => { x: number; y: number }) => {
  const nodes = existing
    ? [
        ...existing.places,
        ...existing.transitions,
        ...(existing.componentInstances ?? []),
      ]
    : [];
  let x = nodes.length === 0 ? 0 : Math.min(...nodes.map((node) => node.x));
  const y =
    nodes.length === 0
      ? 0
      : Math.max(...nodes.map((node) => node.y)) + 8 * GRID_SIZE;
  return () => {
    const position = { x, y };
    x += 10 * GRID_SIZE;
    return position;
  };
};

/** A scope being merged: its declarations, the entities they match, and the result so far. */
type ScopeBuild = {
  declarations: DslScope;
  existing: NetEntities | null;
  /** The subnet's id, `null` for the root. */
  subnetId: string | null;
  nextPosition: () => { x: number; y: number };
  types: Color[];
  typesByName: Map<string, Color>;
  parameters: Parameter[];
  parametersByVariable: Map<string, Parameter>;
  equations: DifferentialEquation[];
  equationsByName: Map<string, DifferentialEquation>;
  places: Place[];
  placesByName: Map<string, Place>;
  instances: ComponentInstance[];
  instancesByName: Map<string, ComponentInstance>;
  fusions: Fusion[];
  transitions: Transition[];
};

const newScopeBuild = (
  declarations: DslScope,
  existing: NetEntities | null,
  subnetId: string | null,
): ScopeBuild => ({
  declarations,
  existing,
  subnetId,
  nextPosition: positionAllocator(existing),
  types: [],
  typesByName: new Map(),
  parameters: [],
  parametersByVariable: new Map(),
  equations: [],
  equationsByName: new Map(),
  places: [],
  placesByName: new Map(),
  instances: [],
  instancesByName: new Map(),
  fusions: [],
  transitions: [],
});

const resolveType = (
  merge: Merge,
  scope: ScopeBuild,
  word: DslWord | null,
): string | null => {
  if (word === null) {
    return null;
  }
  const color = scope.typesByName.get(word.text);
  return color?.id ?? fail(merge, `Unknown type "${word.text}"`, word.range);
};

/** Types, parameters, equations and places: what references resolve to. */
const buildNamedEntities = (merge: Merge, scope: ScopeBuild): void => {
  const { declarations, existing } = scope;

  const usedColors = (existing?.types ?? []).map((color) => color.displayColor);
  for (const { declaration, existing: color } of matchByName(
    merge,
    declarations.types,
    existing?.types ?? [],
    (type) => type.name,
    (type) => type.name,
    "Type",
  )) {
    const elements = matchByName(
      merge,
      declaration.elements,
      color?.elements ?? [],
      (element) => element.name,
      (element) => element.name,
      "Element",
    ).map(({ declaration: element, existing: existingElement }) => ({
      elementId: existingElement?.elementId ?? merge.generateId(),
      name: element.name.text,
      type: element.type,
    }));
    const displayColor = color?.displayColor ?? nextTypeColor(usedColors);
    usedColors.push(displayColor);
    const merged: Color = {
      id: color?.id ?? merge.generateId(),
      name: declaration.name.text,
      ...descriptionOf(declaration, color),
      iconSlug: color?.iconSlug ?? "circle",
      displayColor,
      elements,
    };
    scope.types.push(merged);
    scope.typesByName.set(merged.name, merged);
  }

  for (const { declaration, existing: parameter } of matchByName(
    merge,
    declarations.parameters,
    existing?.parameters ?? [],
    (candidate) => candidate.variableName,
    (candidate) => candidate.variableName,
    "Parameter",
  )) {
    const variableName = declaration.variableName.text;
    // Without a label the text says the name only spells the variable: the
    // document's own spelling of it stays.
    const name =
      declaration.label ??
      (parameter !== null &&
      plainWords(parameter.name) === plainWords(variableName)
        ? parameter.name
        : variableName);
    const merged: Parameter = {
      id: parameter?.id ?? merge.generateId(),
      name,
      variableName,
      type: declaration.type,
      defaultValue: declaration.defaultValue,
    };
    scope.parameters.push(merged);
    scope.parametersByVariable.set(variableName, merged);
  }

  for (const { declaration, existing: equation } of matchByName(
    merge,
    declarations.dynamics,
    existing?.differentialEquations ?? [],
    (candidate) => candidate.name,
    (candidate) => candidate.name,
    "Dynamics",
  )) {
    const merged: DifferentialEquation = {
      id: equation?.id ?? merge.generateId(),
      name: declaration.name.text,
      colorId: resolveType(merge, scope, declaration.type),
      code: declaration.code,
    };
    scope.equations.push(merged);
    scope.equationsByName.set(merged.name, merged);
  }

  for (const { declaration, existing: place } of matchByName(
    merge,
    declarations.places,
    existing?.places ?? [],
    (candidate) => candidate.name,
    (candidate) => candidate.name,
    "Place",
  )) {
    const equation =
      declaration.dynamics === null
        ? null
        : (scope.equationsByName.get(declaration.dynamics.text) ??
          fail(
            merge,
            `Unknown dynamics "${declaration.dynamics.text}"`,
            declaration.dynamics.range,
          ));
    const position = place ?? scope.nextPosition();
    const merged: Place = {
      id: place?.id ?? merge.generateId(),
      name: declaration.name.text,
      ...descriptionOf(declaration, place),
      colorId: resolveType(merge, scope, declaration.type),
      dynamicsEnabled: declaration.dynamics !== null,
      differentialEquationId: equation?.id ?? null,
      // The document's own spelling of "none" stays, so an unchanged text
      // changes nothing.
      ...(declaration.capacity !== null
        ? { capacity: declaration.capacity }
        : place?.capacity === null
          ? { capacity: null }
          : {}),
      ...(declaration.port !== null
        ? { isPort: true, portDirection: declaration.port }
        : place?.isPort === false
          ? { isPort: false }
          : {}),
      ...(declaration.visualizer !== null
        ? { visualizerCode: declaration.visualizer }
        : place?.visualizerCode === ""
          ? { visualizerCode: "" }
          : {}),
      ...(declaration.start
        ? { showAsInitialState: true }
        : place?.showAsInitialState === false
          ? { showAsInitialState: false }
          : {}),
      x: position.x,
      y: position.y,
    };
    scope.places.push(merged);
    scope.placesByName.set(merged.name, merged);
  }
};

type Components = Map<string, { subnetId: string; scope: ScopeBuild }>;

const resolveReference = (
  merge: Merge,
  scope: ScopeBuild,
  components: Components,
  reference: DslPlaceReference,
): ArcEndpoint | null => {
  if (reference.instance === null) {
    const place = scope.placesByName.get(reference.place.text);
    return place
      ? { kind: "place", placeId: place.id }
      : fail(
          merge,
          `Unknown place "${reference.place.text}"`,
          reference.place.range,
        );
  }
  const instance = scope.instancesByName.get(reference.instance.text);
  if (!instance) {
    return fail(
      merge,
      `Unknown instance "${reference.instance.text}"`,
      reference.instance.range,
    );
  }
  const component = [...components.values()].find(
    (candidate) => candidate.subnetId === instance.subnetId,
  );
  const port = component?.scope.placesByName.get(reference.place.text);
  if (!port) {
    return fail(
      merge,
      `Instance "${reference.instance.text}" has no port "${reference.place.text}"`,
      reference.place.range,
    );
  }
  if (!port.isPort) {
    return fail(
      merge,
      `"${reference.place.text}" is a place of the component, not a port`,
      reference.place.range,
    );
  }
  return {
    kind: "componentPort",
    componentInstanceId: instance.id,
    portPlaceId: port.id,
  };
};

const memberKeys = (members: readonly ArcEndpoint[]): Set<string> =>
  new Set(members.map(getArcEndpointKey));

const sameMembers = (left: Set<string>, right: Set<string>): boolean =>
  left.size === right.size && [...left].every((key) => right.has(key));

const sharesMember = (left: Set<string>, right: Set<string>): boolean =>
  [...left].some((key) => right.has(key));

/**
 * The document's fusion a declaration stands for: the one of its name, or
 * for an unnamed one, the one with the same members, else the first unclaimed
 * one sharing a member, since fusions are sets that merge on contact.
 */
const matchFusion = (
  declaration: DslFusionDeclaration,
  members: readonly ArcEndpoint[],
  candidates: readonly Fusion[],
  claimed: Set<Fusion>,
): Fusion | null => {
  const available = candidates.filter((fusion) => !claimed.has(fusion));
  if (declaration.name !== null) {
    const name = declaration.name.text;
    return available.find((fusion) => fusion.name === name) ?? null;
  }
  const keys = memberKeys(members);
  return (
    available.find((fusion) => sameMembers(keys, memberKeys(fusion.members))) ??
    available.find((fusion) =>
      sharesMember(keys, memberKeys(fusion.members)),
    ) ??
    null
  );
};

/** What `fusionSchema` requires: two members or more, each once, and one place of the net at most. */
const fusionShapeHolds = (
  merge: Merge,
  declaration: DslFusionDeclaration,
  members: readonly ArcEndpoint[],
): boolean => {
  if (members.length < 2) {
    fail(merge, "A fusion joins two places or more", declaration.range);
    return false;
  }
  if (memberKeys(members).size < members.length) {
    fail(merge, "A fusion lists each member once", declaration.range);
    return false;
  }
  if (members.filter((member) => member.kind === "place").length > 1) {
    fail(
      merge,
      "A fusion holds one place of its own net at most; the others are ports of its instances",
      declaration.range,
    );
    return false;
  }
  return true;
};

/** The arc of `existing` that touches `endpoint`, whose spelling of the endpoint the merge keeps. */
const existingArc = <Arc extends InputArc | OutputArc>(
  arcs: readonly Arc[] | undefined,
  endpoint: ArcEndpoint,
): Arc | undefined => {
  const key = getArcEndpointKey(endpoint);
  return arcs?.find((arc) => getArcEndpointKey(getArcEndpoint(arc)) === key);
};

const endpointFields = (
  arc: InputArc | OutputArc | undefined,
  endpoint: ArcEndpoint,
): Pick<InputArc, "endpoint" | "placeId"> => {
  if (arc === undefined) {
    return createArcEndpointReference(endpoint);
  }
  return {
    ...(arc.placeId === undefined ? {} : { placeId: arc.placeId }),
    ...(arc.endpoint === undefined ? {} : { endpoint: arc.endpoint }),
  };
};

/** Instances, fusions and transitions: what refers to the named entities. */
const buildReferringEntities = (
  merge: Merge,
  scope: ScopeBuild,
  components: Components,
): void => {
  const { declarations, existing } = scope;

  for (const { declaration, existing: instance } of matchByName(
    merge,
    declarations.instances,
    existing?.componentInstances ?? [],
    (candidate) => candidate.name,
    (candidate) => candidate.name,
    "Instance",
  )) {
    const component = components.get(declaration.component.text);
    if (component === undefined) {
      fail(
        merge,
        `Unknown component "${declaration.component.text}"`,
        declaration.component.range,
      );
      continue;
    }
    const parameterValues: Record<string, string> = {};
    for (const binding of declaration.bindings) {
      const parameter = component.scope.parametersByVariable.get(
        binding.name.text,
      );
      if (parameter === undefined) {
        fail(
          merge,
          `Component "${declaration.component.text}" has no parameter "${binding.name.text}"`,
          binding.name.range,
        );
        continue;
      }
      parameterValues[parameter.id] = binding.value;
    }
    const position = instance ?? scope.nextPosition();
    const merged: ComponentInstance = {
      id: instance?.id ?? merge.generateId(),
      name: declaration.name.text,
      ...descriptionOf(declaration, instance),
      ...metadataOf(instance),
      subnetId: component.subnetId,
      parameterValues,
      x: position.x,
      y: position.y,
    };
    scope.instances.push(merged);
    scope.instancesByName.set(merged.name, merged);
  }

  const claimedFusions = new Set<Fusion>();
  const fusionNames = new Set<string>();
  for (const declaration of declarations.fusions) {
    if (declaration.name !== null) {
      if (fusionNames.has(declaration.name.text)) {
        fail(
          merge,
          `Fusion "${declaration.name.text}" is declared twice`,
          declaration.name.range,
        );
        continue;
      }
      fusionNames.add(declaration.name.text);
    }
    const members = declaration.members
      .map((member) => resolveReference(merge, scope, components, member))
      .filter((member) => member !== null);
    if (members.length !== declaration.members.length) {
      continue;
    }
    if (!fusionShapeHolds(merge, declaration, members)) {
      continue;
    }
    const fusion = matchFusion(
      declaration,
      members,
      existing?.fusions ?? [],
      claimedFusions,
    );
    if (fusion !== null) {
      claimedFusions.add(fusion);
    }
    scope.fusions.push({
      id: fusion?.id ?? merge.generateId(),
      ...(declaration.name === null ? {} : { name: declaration.name.text }),
      ...descriptionOf(declaration, fusion),
      members,
    });
  }

  for (const { declaration, existing: transition } of matchByName(
    merge,
    declarations.transitions,
    existing?.transitions ?? [],
    (candidate) => candidate.name,
    (candidate) => candidate.name,
    "Transition",
  )) {
    const inputArcs: InputArc[] = [];
    for (const arc of declaration.inputs) {
      const endpoint = resolveReference(merge, scope, components, arc.target);
      if (endpoint !== null) {
        inputArcs.push({
          ...endpointFields(
            existingArc(transition?.inputArcs, endpoint),
            endpoint,
          ),
          weight: arc.weight,
          type: arc.type,
        });
      }
    }
    const outputArcs: OutputArc[] = [];
    for (const arc of declaration.outputs) {
      const endpoint = resolveReference(merge, scope, components, arc.target);
      if (endpoint !== null) {
        outputArcs.push({
          ...endpointFields(
            existingArc(transition?.outputArcs, endpoint),
            endpoint,
          ),
          weight: arc.weight,
        });
      }
    }
    const position = transition ?? scope.nextPosition();
    scope.transitions.push({
      id: transition?.id ?? merge.generateId(),
      name: declaration.name.text,
      ...descriptionOf(declaration, transition),
      ...metadataOf(transition),
      inputArcs,
      outputArcs,
      lambdaType:
        declaration.lambda?.type ?? transition?.lambdaType ?? "predicate",
      lambdaCode: declaration.lambda?.code ?? "",
      transitionKernelCode: declaration.kernel ?? "",
      x: position.x,
      y: position.y,
    });
  }

  // The printer writes every port's direction. A port the document left
  // undeclared, and the text declares as the arcs already make it, stays
  // undeclared; a new port keeps what its author wrote.
  for (const place of scope.places) {
    const before = existing?.places.find(({ id }) => id === place.id);
    if (
      place.isPort &&
      before !== undefined &&
      before.portDirection === undefined &&
      place.portDirection === inferPortDirection(scope, place.id)
    ) {
      delete place.portDirection;
    }
  }
};

/** `value` of a marking entry: rows of token data when it reads as JSON, else an expression. */
const markingValue = (
  merge: Merge,
  binding: DslBinding,
): string | (number | boolean | string)[][] | null => {
  if (!binding.value.startsWith("[")) {
    return binding.value;
  }
  try {
    const rows: unknown = JSON.parse(binding.value);
    if (
      Array.isArray(rows) &&
      rows.every(
        (row) =>
          Array.isArray(row) &&
          row.every((cell) =>
            ["number", "boolean", "string"].includes(typeof cell),
          ),
      )
    ) {
      return rows as (number | boolean | string)[][];
    }
  } catch {
    // Reported below.
  }
  return fail(
    merge,
    "Token rows read as JSON: a list of rows, each a list of numbers, booleans or strings",
    binding.range,
  );
};

const buildScenarios = (
  merge: Merge,
  document: DslDocument,
  root: ScopeBuild,
  existing: readonly Scenario[],
): Scenario[] =>
  matchByName(
    merge,
    document.scenarios,
    existing,
    (candidate) => candidate.name,
    (candidate) => candidate.name,
    "Scenario",
  ).map(({ declaration, existing: scenario }) => {
    const parameterOverrides: Record<string, string> = {};
    for (const override of declaration.overrides) {
      const parameter = root.parametersByVariable.get(override.name.text);
      if (parameter === undefined) {
        fail(
          merge,
          `Unknown parameter "${override.name.text}"`,
          override.name.range,
        );
        continue;
      }
      parameterOverrides[parameter.id] = override.value;
    }
    let initialState: Scenario["initialState"];
    if (declaration.initial === null) {
      initialState = scenario?.initialState ?? {
        type: "per_place",
        content: {},
      };
    } else if (declaration.initial.kind === "code") {
      initialState = { type: "code", content: declaration.initial.code };
    } else {
      const content: Record<string, string | (number | boolean | string)[][]> =
        {};
      for (const entry of declaration.initial.entries) {
        const place = root.placesByName.get(entry.name.text);
        if (place === undefined) {
          fail(merge, `Unknown place "${entry.name.text}"`, entry.name.range);
          continue;
        }
        const value = markingValue(merge, entry);
        if (value !== null) {
          content[place.id] = value;
        }
      }
      initialState = { type: "per_place", content };
    }
    return {
      id: scenario?.id ?? merge.generateId(),
      name: declaration.name.text,
      ...descriptionOf(declaration, scenario),
      scenarioParameters: declaration.parameters.map((parameter) => ({
        type: parameter.type,
        identifier: parameter.identifier.text,
        default: parameter.default,
      })),
      parameterOverrides,
      initialState,
    };
  });

const buildMetrics = (
  merge: Merge,
  document: DslDocument,
  existing: readonly Metric[],
): Metric[] =>
  matchByName(
    merge,
    document.metrics,
    existing,
    (candidate) => candidate.name,
    (candidate) => candidate.name,
    "Metric",
  ).map(({ declaration, existing: metric }) => ({
    id: metric?.id ?? merge.generateId(),
    name: declaration.name.text,
    ...descriptionOf(declaration, metric),
    code: declaration.code,
  }));

/** `key: entities` when the text declares any or the document already had the key. */
const optionalList = <Key extends string, Entity>(
  key: Key,
  entities: Entity[],
  existing: readonly Entity[] | undefined,
): { [K in Key]?: Entity[] } =>
  entities.length > 0 || existing !== undefined
    ? ({ [key]: entities } as { [K in Key]?: Entity[] })
    : {};

const assembleSubnet = (
  declaration: DslComponentDeclaration,
  existing: Subnet | null,
  scope: ScopeBuild,
): Subnet => ({
  id: scope.subnetId!,
  name: declaration.name.text,
  ...descriptionOf(declaration, existing),
  ...metadataOf(existing),
  ...(declaration.source === null ? {} : { source: declaration.source }),
  places: scope.places,
  transitions: scope.transitions,
  types: scope.types,
  differentialEquations: scope.equations,
  parameters: scope.parameters,
  ...optionalList(
    "componentInstances",
    scope.instances,
    existing?.componentInstances,
  ),
  ...optionalList("fusions", scope.fusions, existing?.fusions),
});

/**
 * The document `existing` would be once `document` is written onto it, with
 * every entity the text declares matched by name to keep its id and what
 * the text does not say. With an error among the diagnostics there is no
 * document: a reference the text cannot resolve has no good answer.
 */
export const mergeDslDocument = (
  existing: SDCPN,
  document: DslDocument,
  options: DslMergeOptions = {},
): DslMergeResult => {
  const merge: Merge = {
    generateId: options.generateId ?? generatePetrinautId,
    diagnostics: [],
  };

  const componentPairs = matchByName(
    merge,
    document.components,
    existing.subnets ?? [],
    (component) => component.name,
    (subnet) => subnet.name,
    "Component",
  );
  const components: Components = new Map();
  const componentScopes = componentPairs.map((pair) => {
    const subnetId = pair.existing?.id ?? merge.generateId();
    const scope = newScopeBuild(pair.declaration, pair.existing, subnetId);
    components.set(pair.declaration.name.text, { subnetId, scope });
    return { ...pair, scope };
  });
  const root = newScopeBuild(document, existing, null);

  // Every scope's named entities first: an instance in one scope refers to
  // the ports and parameters of a component declared anywhere.
  for (const { scope } of componentScopes) {
    buildNamedEntities(merge, scope);
  }
  buildNamedEntities(merge, root);
  for (const { scope } of componentScopes) {
    buildReferringEntities(merge, scope, components);
  }
  buildReferringEntities(merge, root, components);

  const subnets = componentScopes.map(
    ({ declaration, existing: subnet, scope }) =>
      assembleSubnet(declaration, subnet, scope),
  );
  const metrics = buildMetrics(merge, document, existing.metrics ?? []);
  const scenarios = buildScenarios(
    merge,
    document,
    root,
    existing.scenarios ?? [],
  );

  if (merge.diagnostics.some(({ severity }) => severity === "error")) {
    return { ok: false, diagnostics: merge.diagnostics };
  }

  const sdcpn: SDCPN = {
    ...descriptionOf(document, existing),
    ...metadataOf(existing),
    ...(document.componentsOnly
      ? { componentsOnly: true }
      : existing.componentsOnly === false
        ? { componentsOnly: false }
        : {}),
    places: root.places,
    transitions: root.transitions,
    types: root.types,
    differentialEquations: root.equations,
    parameters: root.parameters,
    ...optionalList("scenarios", scenarios, existing.scenarios),
    ...optionalList("metrics", metrics, existing.metrics),
    ...optionalList("subnets", subnets, existing.subnets),
    ...optionalList(
      "componentInstances",
      root.instances,
      existing.componentInstances,
    ),
    ...optionalList("fusions", root.fusions, existing.fusions),
  };
  return { ok: true, sdcpn, diagnostics: merge.diagnostics };
};
