import { getArcEndpointPlaceId } from "../arc-endpoints";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
} from "../extensions";
import { parseParameterValue } from "../parameter-values";
import { createUserKeyedRecord, getOwn } from "../validation/record-keys";
import { petriNetIrKindOf } from "./petri-net-ir";
import { evaluateStaticLambda } from "./sdcpn-to-petri-net-ir/evaluate-static-lambda";
import {
  createIrNamePool,
  type IrNamePool,
  toIrNetName,
} from "./sdcpn-to-petri-net-ir/ir-names";
import {
  addGuardEvidence,
  addKernelEvidence,
  addMarkingLiteral,
  createStringEvidence,
  lowerColours,
  type StringEvidence,
} from "./sdcpn-to-petri-net-ir/lower-colours";
import { printUserCode } from "./sdcpn-to-petri-net-ir/print-user-code";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirFunction } from "../hir/hir";
import type { InitialMarking, InitialPlaceMarking } from "../simulation/api";
import type {
  Color,
  DifferentialEquation,
  Place,
  SDCPN,
  Transition,
} from "../types/sdcpn";
import type {
  PetriNetIr,
  PetriNetIrArc,
  PetriNetIrArcs,
  PetriNetIrDynamics,
  PetriNetIrMarking,
  PetriNetIrPlace,
  PetriNetIrToken,
  PetriNetIrTransition,
} from "./petri-net-ir";

export type PetriNetIrDiagnosticItem = {
  kind: "place" | "transition" | "parameter" | "colour" | "dynamics" | "net";
  /** The SDCPN id when the item comes from a net, its IR name when it comes from an IR. */
  id: string;
  name: string;
};

/** Why a net, or one of its items, cannot become an IR, or what the IR left out. */
export type PetriNetIrDiagnostic = {
  code: string;
  message: string;
  item: PetriNetIrDiagnosticItem;
};

/** Lowered code keyed by the id of the transition or equation it belongs to. */
export type HirById = Readonly<Record<string, HirFunction | undefined>>;

export type SdcpnToPetriNetIrInput = {
  sdcpn: SDCPN;
  /** The net's title, lowered to the IR's `name`. */
  title: string;
  /**
   * Token counts or token records keyed by place id, as a simulation would
   * start. A place absent here starts empty.
   */
  initialMarking: InitialMarking;
  /**
   * Net parameter values keyed by variable name, as the simulation panel
   * holds them. A missing entry keeps the parameter's default.
   */
  parameterValues: Readonly<Record<string, string>>;
  /**
   * Each transition's condition lowered to HIR, keyed by transition id: the
   * `hir` of the lambda artifacts `compileHirArtifacts` produces with
   * `includeHir`. A transition without an entry is reported as not compiled.
   */
  lambdaHir: HirById;
  /** Each transition's kernel lowered to HIR, keyed by transition id. */
  kernelHir?: HirById;
  /** Each differential equation lowered to HIR, keyed by equation id. */
  dynamicsHir?: HirById;
  /** Defaults to every extension on. */
  extensions?: PetrinautExtensionSettings;
  /**
   * Names the reader of the IR keeps for itself, such as the identifiers a
   * generated module needs. A place or transition that would take one is
   * renamed with a numeric suffix.
   */
  reservedNames?: Iterable<string>;
};

export type SdcpnToPetriNetIrOutcome =
  | { ok: true; ir: PetriNetIr; warnings: PetriNetIrDiagnostic[] }
  | {
      ok: false;
      errors: PetriNetIrDiagnostic[];
      warnings: PetriNetIrDiagnostic[];
    };

type Diagnostics = {
  errors: PetriNetIrDiagnostic[];
  warnings: PetriNetIrDiagnostic[];
};

type ParameterValues = Readonly<Record<string, number | boolean>>;

const rejectUnsupported = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  netItem: PetriNetIrDiagnosticItem,
  diagnostics: Diagnostics,
): void => {
  if (sdcpn.places.length === 0) {
    diagnostics.errors.push({
      code: "empty-net",
      message: "the net has no places yet",
      item: netItem,
    });
  }
  if (extensions.subnets && (sdcpn.componentInstances?.length ?? 0) > 0) {
    diagnostics.errors.push({
      code: "component-instances",
      message: "component instances are outside the IR",
      item: netItem,
    });
  }
};

/**
 * The parameter values the conditions are evaluated against, parsed by type.
 * `null` when one does not parse: the conditions are then not evaluated, so
 * the one error is the parameter's own.
 */
const bakeParameters = (
  sdcpn: SDCPN,
  parameterValues: Readonly<Record<string, string>>,
  extensions: PetrinautExtensionSettings,
  diagnostics: Diagnostics,
): ParameterValues | null => {
  const parameters = createUserKeyedRecord<number | boolean>();
  if (!extensions.parameters) {
    return parameters;
  }
  let valid = true;
  for (const parameter of sdcpn.parameters) {
    const value =
      getOwn(parameterValues, parameter.variableName) ?? parameter.defaultValue;
    try {
      parameters[parameter.variableName] = parseParameterValue(
        parameter,
        value,
      );
    } catch (error) {
      valid = false;
      diagnostics.errors.push({
        code: "parameter-invalid",
        message: error instanceof Error ? error.message : String(error),
        item: { kind: "parameter", id: parameter.id, name: parameter.name },
      });
    }
  }
  return valid ? parameters : null;
};

const placeItem = (place: Place): PetriNetIrDiagnosticItem => ({
  kind: "place",
  id: place.id,
  name: place.name,
});

/** The colour a place's tokens have, when the colours extension is on and the place names one. */
const placeColourId = (
  place: Place,
  extensions: PetrinautExtensionSettings,
): string | null => (extensions.colors ? place.colorId : null);

/** Whether a place's tokens move between steps: the dynamics extension on, and the place opted in. */
const placeDynamicsId = (
  place: Place,
  extensions: PetrinautExtensionSettings,
): string | null =>
  extensions.dynamics && place.dynamicsEnabled
    ? place.differentialEquationId
    : null;

const initialCount = (
  marking: InitialPlaceMarking | undefined,
  item: PetriNetIrDiagnosticItem,
  diagnostics: Diagnostics,
): number => {
  if (marking === undefined) {
    return 0;
  }
  if (typeof marking !== "number") {
    // Token records on a plain place: only their number counts.
    return marking.length;
  }
  if (!Number.isInteger(marking) || marking < 0) {
    diagnostics.errors.push({
      code: "initial-marking-invalid",
      message: `the initial marking is ${marking}, and the IR holds whole token counts`,
      item,
    });
    return 0;
  }
  return marking;
};

/** A coloured place's tokens as IR records, typed against the colour. */
const initialTokens = (
  marking: InitialPlaceMarking | undefined,
  colour: Color,
  item: PetriNetIrDiagnosticItem,
  evidence: StringEvidence,
  diagnostics: Diagnostics,
): PetriNetIrToken[] => {
  if (marking === undefined) {
    return [];
  }
  if (typeof marking === "number") {
    if (marking === 0) {
      return [];
    }
    diagnostics.errors.push({
      code: "marking-token-invalid",
      message: `the initial marking is a count of ${marking}, and a coloured place starts with token records`,
      item,
    });
    return [];
  }
  return marking.map((record) => {
    const token: PetriNetIrToken = {};
    for (const element of colour.elements) {
      const value = getOwn(record, element.name);
      if (value === undefined) {
        diagnostics.errors.push({
          code: "marking-token-invalid",
          message: `a starting token has no ${element.name}`,
          item,
        });
        continue;
      }
      // Ids are stored at rest as strings; a runtime bigint prints the same way.
      const cell = typeof value === "bigint" ? value.toString() : value;
      if (typeof cell === "string" && element.type === "string") {
        addMarkingLiteral(evidence, colour.id, element.name, cell);
      }
      token[element.name] = cell;
    }
    return token;
  });
};

/** The weight an arc entry already carries: none for a missing entry, one for a bare key. */
const weightOf = (entry: PetriNetIrArc | undefined): number =>
  entry === undefined ? 0 : (entry?.weight ?? 1);

/** An arc entry: a bare key for a standard arc of one, a record otherwise. */
const arcEntry = (
  total: number,
  kind: "standard" | "read" | "inhibitor",
): PetriNetIrArc =>
  kind === "standard" && total === 1
    ? null
    : {
        ...(total === 1 ? {} : { weight: total }),
        ...(kind === "standard" ? {} : { kind }),
      };

const resolvePlace = (
  placeId: string | null,
  placeNames: ReadonlyMap<string, string>,
  item: PetriNetIrDiagnosticItem,
  diagnostics: Diagnostics,
): string | null => {
  if (placeId === null) {
    diagnostics.errors.push({
      code: "component-port-arc",
      message: "an arc to a component port is outside the IR",
      item,
    });
    return null;
  }
  const place = placeNames.get(placeId);
  if (place === undefined) {
    diagnostics.errors.push({
      code: "unknown-place",
      message: `an arc points at place ${placeId}, which does not exist`,
      item,
    });
    return null;
  }
  return place;
};

type TransitionContext = {
  sdcpn: SDCPN;
  extensions: PetrinautExtensionSettings;
  /** `null` while a parameter value is invalid; conditions then go unevaluated. */
  parameters: ParameterValues | null;
  lambdaHir: HirById;
  kernelHir: HirById;
  /** IR names by place id. */
  placeNames: ReadonlyMap<string, string>;
  /** IR names by place display name, for the code the IR carries. */
  placeIrNamesByDisplay: ReadonlyMap<string, string>;
  /** Colour ids by place display name, for the places whose tokens carry attributes. */
  placeColours: ReadonlyMap<string, string>;
  colouredPlaceIds: ReadonlySet<string>;
  coloursById: ReadonlyMap<string, Color>;
  names: IrNamePool;
  evidence: StringEvidence;
};

type EvaluatedCondition =
  | { kind: "constant"; rate?: number }
  | { kind: "dead"; reason: string }
  /** The condition reads its tokens or draws, so the IR carries its code. */
  | { kind: "code"; hir: HirFunction };

/**
 * Evaluates the condition to a firing rate (stochastic) or a live/dead
 * verdict (predicate), or hands back the code when it depends on the
 * tokens. `null` means an error was reported, or that the parameters are
 * invalid and the verdict has to wait.
 */
const evaluateCondition = (
  transition: Transition,
  context: TransitionContext,
  item: PetriNetIrDiagnosticItem,
  diagnostics: Diagnostics,
): EvaluatedCondition | null => {
  const availability = getTransitionLogicAvailability(
    transition,
    context.sdcpn,
    context.extensions,
  );
  const stochastic =
    getEffectiveTransitionLambdaType(transition, availability) === "stochastic";
  if (!availability.lambda || transition.lambdaCode.trim() === "") {
    if (stochastic) {
      diagnostics.errors.push({
        code: "missing-rate",
        message:
          "the transition has no condition code, so it fires at an infinite rate, which the IR cannot express",
        item,
      });
      return null;
    }
    return { kind: "constant" };
  }
  if (context.parameters === null) {
    return null;
  }
  const hir = getOwn(context.lambdaHir, transition.id);
  if (hir === undefined) {
    diagnostics.errors.push({
      code: "lambda-not-compiled",
      message: "the condition has not compiled; check its diagnostics",
      item,
    });
    return null;
  }
  const evaluated = evaluateStaticLambda(hir, context.parameters);
  if (!evaluated.ok) {
    if (evaluated.code === "lambda-failed") {
      diagnostics.errors.push({
        code: evaluated.code,
        message: evaluated.message,
        item,
      });
      return null;
    }
    return { kind: "code", hir };
  }
  const { value } = evaluated;
  if (!stochastic) {
    if (typeof value !== "boolean") {
      diagnostics.errors.push({
        code: "lambda-not-boolean",
        message: `the predicate returns ${JSON.stringify(value)}`,
        item,
      });
      return null;
    }
    return value
      ? { kind: "constant" }
      : { kind: "dead", reason: "the predicate is false" };
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    diagnostics.errors.push({
      code: "lambda-not-number",
      message: `the rate is ${JSON.stringify(value)}`,
      item,
    });
    return null;
  }
  if (value === Number.POSITIVE_INFINITY) {
    diagnostics.errors.push({
      code: "infinite-rate",
      message:
        "an infinite rate fires every step, which the IR cannot express as a rate",
      item,
    });
    return null;
  }
  return value > 0
    ? { kind: "constant", rate: value }
    : { kind: "dead", reason: `the rate is ${value}` };
};

/** The code of a surface as the IR carries it, or `null` after reporting why not. */
const codeOf = (
  hir: HirFunction,
  code: string,
  context: TransitionContext,
  item: PetriNetIrDiagnosticItem,
  diagnostics: Diagnostics,
): string | null => {
  const printed = printUserCode(
    hir,
    context.placeIrNamesByDisplay,
    context.parameters ?? {},
  );
  if (!printed.ok) {
    diagnostics.errors.push({
      code,
      message: `the code cannot be written into the IR: ${printed.message}`,
      item,
    });
    return null;
  }
  return printed.code;
};

const lowerArcs = (
  transition: Transition,
  context: TransitionContext,
  item: PetriNetIrDiagnosticItem,
  diagnostics: Diagnostics,
): { inputs: PetriNetIrArcs; outputs: PetriNetIrArcs } => {
  const inputs: PetriNetIrArcs = {};
  const inputKinds = new Map<string, "standard" | "read" | "inhibitor">();
  for (const arc of transition.inputArcs) {
    const place = resolvePlace(
      getArcEndpointPlaceId(arc),
      context.placeNames,
      item,
      diagnostics,
    );
    if (place === null) {
      continue;
    }
    const kind = inputKinds.get(place);
    if (kind !== undefined && kind !== arc.type) {
      diagnostics.errors.push({
        code: "arc-kinds-conflict",
        message: `two input arcs from ${place} are of different kinds, and the IR keeps one entry per place`,
        item,
      });
      continue;
    }
    inputKinds.set(place, arc.type);
    inputs[place] = arcEntry(weightOf(inputs[place]) + arc.weight, arc.type);
  }
  const outputs: PetriNetIrArcs = {};
  for (const arc of transition.outputArcs) {
    const place = resolvePlace(
      getArcEndpointPlaceId(arc),
      context.placeNames,
      item,
      diagnostics,
    );
    if (place !== null) {
      outputs[place] = arcEntry(
        weightOf(outputs[place]) + arc.weight,
        "standard",
      );
    }
  }
  return { inputs, outputs };
};

/**
 * A host marks a transition a controller decides with `control:
 * "controllable"` in its metadata, the convention the flexible
 * manufacturing cell model follows.
 */
const isControllable = (transition: Transition): boolean =>
  transition.metadata?.control === "controllable";

const lowerTransition = (
  transition: Transition,
  context: TransitionContext,
  diagnostics: Diagnostics,
): { name: string; transition: PetriNetIrTransition } | null => {
  const item: PetriNetIrDiagnosticItem = {
    kind: "transition",
    id: transition.id,
    name: transition.name,
  };
  const condition = evaluateCondition(transition, context, item, diagnostics);
  const { inputs, outputs } = lowerArcs(transition, context, item, diagnostics);
  const stochastic =
    getEffectiveTransitionLambdaType(
      transition,
      getTransitionLogicAvailability(
        transition,
        context.sdcpn,
        context.extensions,
      ),
    ) === "stochastic";

  // A kernel only matters where it writes attributes: into a coloured place.
  const writesColoured = transition.outputArcs.some((arc) => {
    const placeId = getArcEndpointPlaceId(arc);
    return placeId !== null && context.colouredPlaceIds.has(placeId);
  });
  let kernel: string | null = null;
  if (writesColoured) {
    const hir = getOwn(context.kernelHir, transition.id);
    if (hir === undefined) {
      diagnostics.errors.push({
        code: "kernel-not-compiled",
        message:
          "the transition produces coloured tokens and its kernel has not compiled; check its diagnostics",
        item,
      });
    } else {
      addKernelEvidence(
        context.evidence,
        hir,
        context.placeColours,
        context.coloursById,
      );
      kernel = codeOf(hir, "kernel-not-printable", context, item, diagnostics);
    }
  }

  if (condition === null) {
    return null;
  }
  if (condition.kind === "dead") {
    diagnostics.warnings.push({
      code: "dead-transition",
      message: `${condition.reason}, so the transition is left out`,
      item,
    });
    return null;
  }
  let guard: string | undefined;
  let rate: number | string | undefined;
  if (condition.kind === "code") {
    addGuardEvidence(context.evidence, condition.hir, context.placeColours);
    const code = codeOf(
      condition.hir,
      "condition-not-printable",
      context,
      item,
      diagnostics,
    );
    if (code === null) {
      return null;
    }
    if (stochastic) {
      rate = code;
    } else {
      guard = code;
    }
  } else {
    rate = condition.rate;
  }
  if (writesColoured && kernel === null) {
    return null;
  }

  const name = context.names.claim(transition.name || transition.id, "T");
  return {
    name,
    transition: {
      ...(Object.keys(inputs).length === 0 ? {} : { inputs }),
      ...(Object.keys(outputs).length === 0 ? {} : { outputs }),
      ...(guard === undefined ? {} : { guard }),
      ...(rate === undefined ? {} : { rate }),
      ...(kernel === null ? {} : { kernel }),
      ...(isControllable(transition) ? { controllable: true } : {}),
    },
  };
};

const lowerDynamics = (
  equation: DifferentialEquation,
  context: {
    hir: HirFunction | undefined;
    colourNames: ReadonlyMap<string, string>;
    placeIrNamesByDisplay: ReadonlyMap<string, string>;
    parameters: ParameterValues | null;
  },
  diagnostics: Diagnostics,
): PetriNetIrDynamics | null => {
  const item: PetriNetIrDiagnosticItem = {
    kind: "dynamics",
    id: equation.id,
    name: equation.name,
  };
  const colour =
    equation.colorId === null
      ? undefined
      : context.colourNames.get(equation.colorId);
  if (colour === undefined) {
    diagnostics.errors.push({
      code: "dynamics-without-colour",
      message: "the differential equation names no colour a place uses",
      item,
    });
    return null;
  }
  if (context.hir === undefined) {
    diagnostics.errors.push({
      code: "dynamics-not-compiled",
      message:
        "the differential equation has not compiled; check its diagnostics",
      item,
    });
    return null;
  }
  if (context.parameters === null) {
    return null;
  }
  const printed = printUserCode(
    context.hir,
    context.placeIrNamesByDisplay,
    context.parameters,
  );
  if (!printed.ok) {
    diagnostics.errors.push({
      code: "dynamics-not-printable",
      message: `the code cannot be written into the IR: ${printed.message}`,
      item,
    });
    return null;
  }
  return { colour, code: printed.code };
};

/**
 * Turns a net into the Petri net IR, with its initial marking taken from
 * `initialMarking` and its conditions evaluated to constants against
 * `parameterValues` where they can be, or carried as code where they read
 * their tokens. Every reason the net cannot become an IR is reported as an
 * error; a transition that can never fire is left out with a warning.
 */
export const sdcpnToPetriNetIr = (
  input: SdcpnToPetriNetIrInput,
): SdcpnToPetriNetIrOutcome => {
  const { sdcpn } = input;
  const extensions = input.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS;
  const diagnostics: Diagnostics = { errors: [], warnings: [] };
  const netItem: PetriNetIrDiagnosticItem = {
    kind: "net",
    id: "net",
    name: input.title,
  };

  rejectUnsupported(sdcpn, extensions, netItem, diagnostics);
  const parameters = bakeParameters(
    sdcpn,
    input.parameterValues,
    extensions,
    diagnostics,
  );

  const names = createIrNamePool(input.reservedNames ?? []);
  const placeNames = new Map(
    sdcpn.places.map(
      (place) => [place.id, names.claim(place.name || place.id, "P")] as const,
    ),
  );
  const placeIrNamesByDisplay = new Map(
    sdcpn.places.map(
      (place) => [place.name, placeNames.get(place.id) ?? place.id] as const,
    ),
  );
  const coloursById = new Map(sdcpn.types.map((colour) => [colour.id, colour]));
  const equationsById = new Map(
    sdcpn.differentialEquations.map((equation) => [equation.id, equation]),
  );
  const usedColourIds = new Set<string>();
  const usedEquationIds = new Set<string>();
  for (const place of sdcpn.places) {
    const colourId = placeColourId(place, extensions);
    if (colourId !== null) {
      usedColourIds.add(colourId);
    }
    const equationId = placeDynamicsId(place, extensions);
    if (equationId !== null) {
      usedEquationIds.add(equationId);
    }
  }
  const colourNames = new Map(
    sdcpn.types
      .filter((colour) => usedColourIds.has(colour.id))
      .map(
        (colour) =>
          [colour.id, names.claim(colour.name || colour.id, "C")] as const,
      ),
  );
  const equationNames = new Map(
    sdcpn.differentialEquations
      .filter((equation) => usedEquationIds.has(equation.id))
      .map(
        (equation) =>
          [
            equation.id,
            names.claim(equation.name || equation.id, "D"),
          ] as const,
      ),
  );
  const placeColours = new Map<string, string>();
  const colouredPlaceIds = new Set<string>();
  for (const place of sdcpn.places) {
    const colourId = placeColourId(place, extensions);
    if (colourId !== null && coloursById.has(colourId)) {
      placeColours.set(place.name, colourId);
      colouredPlaceIds.add(place.id);
    }
  }
  const evidence = createStringEvidence();

  const places: Record<string, PetriNetIrPlace> = {};
  const marking: PetriNetIrMarking = {};
  for (const place of sdcpn.places) {
    const item = placeItem(place);
    const name = placeNames.get(place.id) ?? place.id;
    const colourId = placeColourId(place, extensions);
    const colour = colourId === null ? undefined : coloursById.get(colourId);
    if (colourId !== null && colour === undefined) {
      diagnostics.errors.push({
        code: "unknown-colour",
        message: `the place's colour ${colourId} does not exist`,
        item,
      });
    }
    const equationId = placeDynamicsId(place, extensions);
    if (equationId !== null && !equationsById.has(equationId)) {
      diagnostics.errors.push({
        code: "unknown-dynamics",
        message: `the place's differential equation ${equationId} does not exist`,
        item,
      });
    }
    const initial = getOwn(input.initialMarking, place.id);
    let tokens = 0;
    if (colour === undefined) {
      tokens = initialCount(initial, item, diagnostics);
      if (tokens > 0) {
        marking[name] = tokens;
      }
    } else {
      const rows = initialTokens(initial, colour, item, evidence, diagnostics);
      tokens = rows.length;
      if (rows.length > 0) {
        marking[name] = rows;
      }
    }
    const capacity =
      typeof place.capacity === "number" &&
      Number.isInteger(place.capacity) &&
      place.capacity >= 0
        ? place.capacity
        : undefined;
    if (capacity !== undefined && tokens > capacity) {
      // A simulation refuses to start from this marking; a module would run from it.
      diagnostics.errors.push({
        code: "initial-marking-over-capacity",
        message: `the initial marking is ${tokens}, over the capacity of ${capacity}`,
        item,
      });
    }
    const entry: NonNullable<PetriNetIrPlace> = {
      ...(capacity === undefined ? {} : { capacity }),
      ...(colour === undefined ? {} : { colour: colourNames.get(colour.id) }),
      ...(equationId === null || !equationsById.has(equationId)
        ? {}
        : { dynamics: equationNames.get(equationId) }),
    };
    places[name] = Object.keys(entry).length === 0 ? null : entry;
  }

  const dynamics: Record<string, PetriNetIrDynamics> = {};
  for (const equationId of usedEquationIds) {
    const equation = equationsById.get(equationId);
    const name = equationNames.get(equationId);
    if (equation === undefined || name === undefined) {
      continue;
    }
    const lowered = lowerDynamics(
      equation,
      {
        hir: getOwn(input.dynamicsHir ?? {}, equation.id),
        colourNames,
        placeIrNamesByDisplay,
        parameters,
      },
      diagnostics,
    );
    if (lowered !== null) {
      dynamics[name] = lowered;
    }
  }

  const transitions: Record<string, PetriNetIrTransition> = {};
  for (const transition of sdcpn.transitions) {
    const lowered = lowerTransition(
      transition,
      {
        sdcpn,
        extensions,
        parameters,
        lambdaHir: input.lambdaHir,
        kernelHir: input.kernelHir ?? {},
        placeNames,
        placeIrNamesByDisplay,
        placeColours,
        colouredPlaceIds,
        coloursById,
        names,
        evidence,
      },
      diagnostics,
    );
    if (lowered !== null) {
      transitions[lowered.name] = lowered.transition;
    }
  }

  if (diagnostics.errors.length > 0) {
    return { ok: false, ...diagnostics };
  }
  const colours = lowerColours(sdcpn, usedColourIds, colourNames, evidence);
  const description = sdcpn.description?.trim();
  return {
    ok: true,
    ir: {
      name: toIrNetName(input.title),
      ...(description === undefined || description === ""
        ? {}
        : { description }),
      kind: petriNetIrKindOf(transitions),
      ...(Object.keys(colours).length === 0 ? {} : { colours }),
      ...(Object.keys(dynamics).length === 0 ? {} : { dynamics }),
      places,
      ...(Object.keys(marking).length === 0 ? {} : { marking }),
      transitions,
    },
    warnings: diagnostics.warnings,
  };
};
