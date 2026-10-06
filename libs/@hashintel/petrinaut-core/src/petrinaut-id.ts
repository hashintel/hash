/**
 * Petrinaut id helpers. A Petrinaut id is a lowercase UUID: a net id (a
 * document's `PetrinautDocHandle.id`) and every entity id inside a document
 * are Petrinaut ids. Ids in any other form are converted on load with
 * {@link toPetrinautId}, so the same legacy id always names the same item.
 */

import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

import { getArcEndpointKey, parseArcEndpointKey } from "./arc-endpoints";
import { generateArcId } from "./arc-id";
import { isUuidString } from "./simulation/engine/uuid";
import { parseArcId } from "./types/selection";

import type {
  AdHocScenarioState,
  ArcEndpoint,
  Color,
  ComponentInstance,
  DifferentialEquation,
  InputArc,
  OutputArc,
  Place,
  Scenario,
  SDCPN,
  Subnet,
  Transition,
} from "./types/sdcpn";

/**
 * UUIDv5 namespace under which non-UUID ids are converted. This value MUST
 * NEVER change: converted ids are persisted in documents, URLs and host
 * storage, and a new namespace would silently remap every one of them.
 */
const PETRINAUT_ID_NAMESPACE = "f346239e-b5e3-53b6-bb7e-297046d1ac64";

/** Whether `value` is a Petrinaut id: a UUID string in lowercase. */
export const isPetrinautId = (value: unknown): value is string =>
  isUuidString(value) && value === value.toLowerCase();

/**
 * Converts any id to a Petrinaut id: a UUID is lowercased, anything else becomes
 * its UUIDv5 under {@link PETRINAUT_ID_NAMESPACE}. Deterministic and
 * idempotent.
 */
export const toPetrinautId = (id: string): string =>
  isUuidString(id) ? id.toLowerCase() : uuidv5(id, PETRINAUT_ID_NAMESPACE);

/** A fresh random Petrinaut id. */
export const generatePetrinautId = (): string => uuidv4();

type ConvertId = (id: string) => string;

/** `toPetrinautId` with a cache, for one pass over a net whose ids repeat. */
const createIdConverter = (): ConvertId => {
  const converted = new Map<string, string>();
  return (id) => {
    let canonical = converted.get(id);
    if (canonical === undefined) {
      canonical = toPetrinautId(id);
      converted.set(id, canonical);
    }
    return canonical;
  };
};

/** `item` itself when no change differs from it, otherwise a changed copy. */
const assignChanged = <Item extends object>(
  item: Item,
  changes: { [Key in keyof Item]?: Item[Key] },
): Item => {
  let changed: Item | undefined;
  for (const key of Object.keys(changes) as (keyof Item)[]) {
    if (changes[key] !== item[key]) {
      changed ??= { ...item };
      changed[key] = changes[key] as Item[keyof Item];
    }
  }
  return changed ?? item;
};

const mapUnlessUnchanged = <Item>(
  items: Item[],
  mapItem: (item: Item) => Item,
): Item[] => {
  const mapped = items.map(mapItem);
  return mapped.every((item, index) => item === items[index]) ? items : mapped;
};

/** `record` with every key converted; itself when every key is canonical. */
const rekeyUnlessUnchanged = <Value>(
  record: Record<string, Value>,
  convertId: ConvertId,
): Record<string, Value> => {
  const entries = Object.entries(record);
  if (entries.every(([key]) => convertId(key) === key)) {
    return record;
  }
  return Object.fromEntries(
    entries.map(([key, value]) => [convertId(key), value]),
  );
};

const canonicalizeEndpoint = (
  endpoint: ArcEndpoint,
  convertId: ConvertId,
): ArcEndpoint =>
  endpoint.kind === "place"
    ? assignChanged(endpoint, { placeId: convertId(endpoint.placeId) })
    : assignChanged(endpoint, {
        componentInstanceId: convertId(endpoint.componentInstanceId),
        portPlaceId: convertId(endpoint.portPlaceId),
      });

const canonicalizeArc = <Arc extends InputArc | OutputArc>(
  arc: Arc,
  convertId: ConvertId,
): Arc =>
  assignChanged<InputArc | OutputArc>(arc, {
    placeId: arc.placeId === undefined ? undefined : convertId(arc.placeId),
    endpoint:
      arc.endpoint === undefined
        ? undefined
        : canonicalizeEndpoint(arc.endpoint, convertId),
  }) as Arc;

const canonicalizeOptionalId = (
  id: string | null,
  convertId: ConvertId,
): string | null => (id === null ? null : convertId(id));

const canonicalizePlace = (place: Place, convertId: ConvertId): Place =>
  assignChanged(place, {
    id: convertId(place.id),
    colorId: canonicalizeOptionalId(place.colorId, convertId),
    differentialEquationId: canonicalizeOptionalId(
      place.differentialEquationId,
      convertId,
    ),
  });

const canonicalizeTransition = (
  transition: Transition,
  convertId: ConvertId,
): Transition =>
  assignChanged(transition, {
    id: convertId(transition.id),
    inputArcs: mapUnlessUnchanged(transition.inputArcs, (arc) =>
      canonicalizeArc(arc, convertId),
    ),
    outputArcs: mapUnlessUnchanged(transition.outputArcs, (arc) =>
      canonicalizeArc(arc, convertId),
    ),
  });

const canonicalizeColor = (color: Color, convertId: ConvertId): Color =>
  assignChanged(color, {
    id: convertId(color.id),
    elements: mapUnlessUnchanged(color.elements, (element) =>
      assignChanged(element, { elementId: convertId(element.elementId) }),
    ),
  });

const canonicalizeDifferentialEquation = (
  equation: DifferentialEquation,
  convertId: ConvertId,
): DifferentialEquation =>
  assignChanged(equation, {
    id: convertId(equation.id),
    colorId: canonicalizeOptionalId(equation.colorId, convertId),
  });

const canonicalizeComponentInstance = (
  instance: ComponentInstance,
  convertId: ConvertId,
): ComponentInstance =>
  assignChanged(instance, {
    id: convertId(instance.id),
    subnetId: convertId(instance.subnetId),
    parameterValues: rekeyUnlessUnchanged(instance.parameterValues, convertId),
  });

const canonicalizeAdHocState = (
  state: AdHocScenarioState,
  convertId: ConvertId,
): AdHocScenarioState =>
  assignChanged(state, {
    netParameters: mapUnlessUnchanged(state.netParameters, (parameter) =>
      assignChanged(parameter, {
        parameterId: convertId(parameter.parameterId),
      }),
    ),
    places: rekeyUnlessUnchanged(state.places, convertId),
  });

const canonicalizeInitialState = (
  initialState: Scenario["initialState"],
  convertId: ConvertId,
): Scenario["initialState"] => {
  switch (initialState.type) {
    case "per_place":
      return assignChanged(initialState, {
        content: rekeyUnlessUnchanged(initialState.content, convertId),
      });
    case "adhoc":
      return assignChanged(initialState, {
        content: canonicalizeAdHocState(initialState.content, convertId),
      });
    case "code":
      return initialState;
  }
};

const canonicalizeScenario = (
  scenario: Scenario,
  convertId: ConvertId,
): Scenario =>
  assignChanged(scenario, {
    id: convertId(scenario.id),
    parameterOverrides: rekeyUnlessUnchanged(
      scenario.parameterOverrides,
      convertId,
    ),
    initialState: canonicalizeInitialState(scenario.initialState, convertId),
  });

const mapOptional = <Item>(
  items: Item[] | undefined,
  mapItem: (item: Item) => Item,
): Item[] | undefined =>
  items === undefined ? undefined : mapUnlessUnchanged(items, mapItem);

/** The entity collections a net, a subnet or a clipboard selection carries. */
export type PetrinautIdNet = Pick<
  SDCPN,
  "places" | "transitions" | "types" | "differentialEquations" | "parameters"
> &
  Partial<Pick<SDCPN, "componentInstances" | "scenarios" | "metrics">> & {
    subnets?: Subnet[];
  };

const canonicalizeNet = <Net extends PetrinautIdNet>(
  net: Net,
  convertId: ConvertId,
): Net =>
  assignChanged<PetrinautIdNet>(net, {
    places: mapUnlessUnchanged(net.places, (place) =>
      canonicalizePlace(place, convertId),
    ),
    transitions: mapUnlessUnchanged(net.transitions, (transition) =>
      canonicalizeTransition(transition, convertId),
    ),
    types: mapUnlessUnchanged(net.types, (color) =>
      canonicalizeColor(color, convertId),
    ),
    differentialEquations: mapUnlessUnchanged(
      net.differentialEquations,
      (equation) => canonicalizeDifferentialEquation(equation, convertId),
    ),
    parameters: mapUnlessUnchanged(net.parameters, (parameter) =>
      assignChanged(parameter, { id: convertId(parameter.id) }),
    ),
    componentInstances: mapOptional(net.componentInstances, (instance) =>
      canonicalizeComponentInstance(instance, convertId),
    ),
    scenarios: mapOptional(net.scenarios, (scenario) =>
      canonicalizeScenario(scenario, convertId),
    ),
    metrics: mapOptional(net.metrics, (metric) =>
      assignChanged(metric, { id: convertId(metric.id) }),
    ),
    subnets: mapOptional(net.subnets, (subnet) =>
      assignChanged(canonicalizeNet(subnet, convertId), {
        id: convertId(subnet.id),
      }),
    ),
  }) as Net;

/**
 * Converts every entity id in `net` to a Petrinaut id, together with every
 * reference to it: arc endpoints, type and equation references, component
 * instances' subnets and parameter values, and the scenario overrides and
 * initial states keyed by id, at the root and inside subnets. Names, user
 * code, metadata and token values are left as they are. Returns `net` itself
 * when every id is already canonical.
 */
export const canonicalizePetrinautIds = <Net extends PetrinautIdNet>(
  net: Net,
): Net => canonicalizeNet(net, createIdConverter());

/**
 * Converts the ids inside a generated arc id (`$A_<input>___<output>`), so an
 * arc id built from legacy ids names the same arc after its places and
 * transitions are converted. Any other string is returned unchanged.
 */
export const canonicalizeArcId = (arcId: string): string => {
  const parsed = parseArcId(arcId);
  if (parsed === null) {
    return arcId;
  }
  const canonicalizeSide = (side: string): string => {
    const endpoint = parseArcEndpointKey(side);
    return endpoint === null
      ? toPetrinautId(side)
      : getArcEndpointKey(canonicalizeEndpoint(endpoint, toPetrinautId));
  };
  return generateArcId({
    inputId: canonicalizeSide(parsed.sourceId),
    outputId: canonicalizeSide(parsed.targetId),
  });
};
