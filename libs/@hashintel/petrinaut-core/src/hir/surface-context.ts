/**
 * Surface contexts describe the model-derived environment a piece of user
 * code executes in: which parameters exist, which places deliver tokens (and
 * with which attributes), and what shape the result must have.
 *
 * They are consumed by the HIR type checker, lint rules and the buffer-ABI
 * emitters. Lowering and generic JS emission work without a context so they
 * stay usable where the SDCPN is not available (e.g. isolated tests).
 *
 * ## Slot layout invariant (buffer ABI)
 *
 * `inputSlots` lists one entry per **colored, non-inhibitor input arc whose
 * color has at least one element**, in arc order — this must match the
 * engine's `inputPlacesWithTokenValues` filter (`dimensions > 0 && arcType
 * !== "inhibitor"`, see `compute-possible-transition.ts`). Each entry
 * occupies `tokenCount` (arc weight) consecutive token slots. `outputSlots`
 * lists colored output arcs in arc order (including zero-element colors,
 * which occupy no floats but must still be produced by kernels).
 *
 * When several arcs reference places with the same display name, the runtime
 * `tokensByPlace` object keeps the LAST arc's tokens (object key overwrite) —
 * both the merged `inputPlaces` bindings and name-based slot resolution
 * follow that rule.
 */
import { getArcEndpoint } from "../arc-endpoints";
import {
  createArcPlaceResolver,
  DEFAULT_PETRINAUT_EXTENSIONS,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
  type PetrinautExtensionSettings,
} from "../extensions";

import type {
  Color,
  ColorElementType,
  ComponentInstance,
  InputArc,
  OutputArc,
  Parameter,
  Place,
  SDCPN,
  Transition,
} from "../types/sdcpn";

/** The net a transition/differential equation belongs to (root or subnet). */
export type HirNetScope = {
  places: Place[];
  parameters: Parameter[];
  componentInstances?: ComponentInstance[];
};

export type HirParameterInfo = {
  /** The identifier used in user code (`parameters.<name>`). */
  name: string;
  type: ColorElementType;
};

export type HirTokenElementInfo = {
  name: string;
  type: ColorElementType;
};

/** A place, as seen from a transition through its arcs (merged by name). */
export type HirPlaceBinding = {
  /** Display name used as the object key in user code (scoped
   * `Instance::Port` for component ports). */
  name: string;
  colorId: string;
  elements: HirTokenElementInfo[];
  /** Number of tokens delivered/produced (arc weight; last arc wins for
   * duplicate names, matching runtime object-key overwrite). */
  tokenCount: number;
};

/**
 * One arc's worth of token slots in the buffer ABI (see module doc).
 * `slotStart` is the index of the arc's first token slot.
 */
export type HirArcSlot = {
  name: string;
  colorId: string;
  elements: HirTokenElementInfo[];
  tokenCount: number;
  slotStart: number;
};

export type HirDynamicsContext = {
  surface: "dynamics";
  parameters: HirParameterInfo[];
  /** Attributes of the color the differential equation is attached to. */
  elements: HirTokenElementInfo[];
};

export type HirLambdaContext = {
  surface: "lambda";
  parameters: HirParameterInfo[];
  inputPlaces: HirPlaceBinding[];
  /** Buffer-ABI input slot layout (see module doc). */
  inputSlots: HirArcSlot[];
  lambdaType: "predicate" | "stochastic";
};

export type HirKernelContext = {
  surface: "kernel";
  parameters: HirParameterInfo[];
  inputPlaces: HirPlaceBinding[];
  /** Buffer-ABI input slot layout (see module doc). */
  inputSlots: HirArcSlot[];
  outputPlaces: HirPlaceBinding[];
  /** Buffer-ABI output slot layout: colored output arcs in arc order. */
  outputSlots: HirArcSlot[];
  /** Whether the stochasticity extension is enabled (Distribution allowed). */
  stochasticity: boolean;
};

/** One root-net place as seen by metric code (`state.places.<name>`). */
export type HirMetricPlaceInfo = {
  name: string;
  /** Attributes of the place's color; empty for uncolored places (they still
   * expose `count` and an empty-record `tokens` array). */
  elements: HirTokenElementInfo[];
};

export type HirMetricContext = {
  surface: "metric";
  /** Root-net parameters, read ambiently in metric code as
   * `parameters.<name>`. Empty when the parameters extension is disabled.
   * Scenario parameters are deliberately not exposed to metrics. */
  parameters: HirParameterInfo[];
  /** ALL places of the root net, keyed by display name (last name wins for
   * duplicates, matching the runtime object-key overwrite). */
  places: HirMetricPlaceInfo[];
};

export type HirSurfaceContext =
  | HirDynamicsContext
  | HirLambdaContext
  | HirKernelContext
  | HirMetricContext;

const SCOPE_SEPARATOR = "::";

function toParameterInfos(parameters: Parameter[]): HirParameterInfo[] {
  return parameters.map((parameter) => ({
    name: parameter.variableName,
    type: parameter.type,
  }));
}

/**
 * Display name for the place an arc points at — must match the property keys
 * generated for the LSP `Input`/`Output` types and the runtime
 * `tokensByPlace` objects (`Instance::Port` scoping for component ports).
 */
function getArcPlaceDisplayName(
  arc: InputArc | OutputArc,
  sdcpn: SDCPN,
  net: HirNetScope,
): string {
  const endpoint = getArcEndpoint(arc);

  if (endpoint.kind === "place") {
    const place = net.places.find((pl) => pl.id === endpoint.placeId);
    return place?.name ?? endpoint.placeId;
  }

  const instance = net.componentInstances?.find(
    (inst) => inst.id === endpoint.componentInstanceId,
  );
  const subnet = instance
    ? sdcpn.subnets?.find((sn) => sn.id === instance.subnetId)
    : undefined;
  const portPlace = subnet?.places.find(
    (pl) => pl.id === endpoint.portPlaceId && pl.isPort,
  );

  if (instance && portPlace) {
    return `${instance.name}${SCOPE_SEPARATOR}${portPlace.name}`;
  }

  return endpoint.componentInstanceId + SCOPE_SEPARATOR + endpoint.portPlaceId;
}

type ArcCollection = {
  /** Merged by display name; last arc wins (runtime key-overwrite parity). */
  bindings: HirPlaceBinding[];
  /** Per-arc slots in arc order (engine filter applied). */
  slots: HirArcSlot[];
};

function collectArcs(
  arcs: (InputArc | OutputArc)[],
  sdcpn: SDCPN,
  net: HirNetScope,
  extensions: PetrinautExtensionSettings,
  colorById: Map<string, Color>,
  options: { includeZeroElementColors: boolean },
): ArcCollection {
  const resolveArcPlace = createArcPlaceResolver(sdcpn, net, {
    componentPortsEnabled: extensions.subnets,
  });
  const bindings = new Map<string, HirPlaceBinding>();
  const slots: HirArcSlot[] = [];
  let slotStart = 0;

  for (const arc of arcs) {
    if ("type" in arc && arc.type === "inhibitor") {
      continue;
    }
    const place = resolveArcPlace(arc);
    if (!extensions.colors || !place?.colorId) {
      continue;
    }
    const color = colorById.get(place.colorId);
    if (!color) {
      continue;
    }
    if (color.elements.length === 0 && !options.includeZeroElementColors) {
      continue;
    }

    const name = getArcPlaceDisplayName(arc, sdcpn, net);
    const elements = color.elements.map((element) => ({
      name: element.name,
      type: element.type,
    }));

    // Last arc with a given name wins, matching the runtime's object-key
    // overwrite when building `tokensByPlace`.
    bindings.set(name, {
      name,
      colorId: color.id,
      elements,
      tokenCount: arc.weight,
    });

    slots.push({
      name,
      colorId: color.id,
      elements,
      tokenCount: arc.weight,
      slotStart,
    });
    slotStart += arc.weight;
  }

  return { bindings: [...bindings.values()], slots };
}

function collectColors(
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): Map<string, Color> {
  const allColors = extensions.colors
    ? [
        ...sdcpn.types,
        ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.types),
      ]
    : [];
  return new Map(allColors.map((color) => [color.id, color]));
}

/**
 * Builds the context for a differential equation attached to `color`.
 * Pass `net` when the equation belongs to a subnet (its parameters apply).
 */
export function buildDynamicsContext(
  sdcpn: SDCPN,
  colorId: string,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
  net: HirNetScope = sdcpn,
): HirDynamicsContext | null {
  const color = collectColors(sdcpn, extensions).get(colorId);
  if (!color) {
    return null;
  }
  return {
    surface: "dynamics",
    parameters: toParameterInfos(extensions.parameters ? net.parameters : []),
    elements: color.elements.map((element) => ({
      name: element.name,
      type: element.type,
    })),
  };
}

/**
 * Builds the context for a transition's lambda. Pass `net` when the
 * transition belongs to a subnet.
 */
export function buildLambdaContext(
  sdcpn: SDCPN,
  transition: Transition,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
  net: HirNetScope = sdcpn,
): HirLambdaContext {
  const availability = getTransitionLogicAvailability(
    transition,
    sdcpn,
    extensions,
    net,
  );
  const { bindings, slots } = collectArcs(
    transition.inputArcs,
    sdcpn,
    net,
    extensions,
    collectColors(sdcpn, extensions),
    { includeZeroElementColors: false },
  );
  return {
    surface: "lambda",
    parameters: toParameterInfos(extensions.parameters ? net.parameters : []),
    inputPlaces: bindings,
    inputSlots: slots,
    lambdaType: getEffectiveTransitionLambdaType(transition, availability),
  };
}

/**
 * Builds the context for a metric: every place of the root net by display
 * name. Uncolored places (and places whose color has no elements) expose
 * `count` plus an empty-record `tokens` array. Root-net parameters are
 * exposed as ambient `parameters.<name>` reads (gated by the parameters
 * extension); scenario parameters are not available to metrics.
 */
export function buildMetricContext(
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): HirMetricContext {
  const colorById = collectColors(sdcpn, extensions);
  const placesByName = new Map<string, HirMetricPlaceInfo>();
  for (const place of sdcpn.places) {
    const color = place.colorId ? colorById.get(place.colorId) : undefined;
    placesByName.set(place.name, {
      name: place.name,
      elements: (color?.elements ?? []).map((element) => ({
        name: element.name,
        type: element.type,
      })),
    });
  }
  return {
    surface: "metric",
    parameters: toParameterInfos(extensions.parameters ? sdcpn.parameters : []),
    places: [...placesByName.values()],
  };
}

/**
 * Builds the context for a transition's kernel. Pass `net` when the
 * transition belongs to a subnet.
 */
export function buildKernelContext(
  sdcpn: SDCPN,
  transition: Transition,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
  net: HirNetScope = sdcpn,
): HirKernelContext {
  const colorById = collectColors(sdcpn, extensions);
  const inputs = collectArcs(
    transition.inputArcs,
    sdcpn,
    net,
    extensions,
    colorById,
    { includeZeroElementColors: false },
  );
  const outputs = collectArcs(
    transition.outputArcs,
    sdcpn,
    net,
    extensions,
    colorById,
    // Zero-element colored outputs still require a (token-count-sized) entry
    // in the kernel result, they just carry no attribute floats.
    { includeZeroElementColors: true },
  );
  return {
    surface: "kernel",
    parameters: toParameterInfos(extensions.parameters ? net.parameters : []),
    inputPlaces: inputs.bindings,
    inputSlots: inputs.slots,
    outputPlaces: outputs.bindings,
    outputSlots: outputs.slots,
    stochasticity: extensions.stochasticity,
  };
}
