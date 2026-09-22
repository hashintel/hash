import { getArcEndpointPlaceId } from "../arc-endpoints";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
} from "../extensions";
import { parseParameterValue } from "../parameter-values";
import { createUserKeyedRecord, getOwn } from "../validation/record-keys";
import { RESERVED_MODULE_NAMES } from "./petri-net-ir-to-reactive-module";
import { evaluateStaticLambda } from "./sdcpn-to-petri-net-ir/evaluate-static-lambda";
import {
  createIrNamePool,
  type IrNamePool,
  toIrNetName,
} from "./sdcpn-to-petri-net-ir/ir-names";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirFunction } from "../hir/hir";
import type { InitialMarking } from "../simulation/api";
import type { SDCPN, Transition } from "../types/sdcpn";
import type {
  PetriNetIr,
  PetriNetIrArcs,
  PetriNetIrKind,
  PetriNetIrPlace,
  PetriNetIrTransition,
} from "./petri-net-ir";

export type PetriNetIrDiagnosticItem = {
  kind: "place" | "transition" | "parameter" | "net";
  id: string;
  name: string;
};

/** Why a net, or one of its items, cannot become an IR, or what the IR left out. */
export type PetriNetIrDiagnostic = {
  code: string;
  message: string;
  item: PetriNetIrDiagnosticItem;
};

export type SdcpnToPetriNetIrInput = {
  sdcpn: SDCPN;
  /** The net's title, lowered to the IR's `name`. */
  title: string;
  /**
   * Token counts keyed by place id, as a simulation would start. A place
   * absent here starts empty.
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
  lambdaHir: Readonly<Record<string, HirFunction | undefined>>;
  /** Defaults to every extension on. */
  extensions?: PetrinautExtensionSettings;
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
  for (const place of sdcpn.places) {
    const item: PetriNetIrDiagnosticItem = {
      kind: "place",
      id: place.id,
      name: place.name,
    };
    if (extensions.colors && place.colorId !== null) {
      diagnostics.errors.push({
        code: "coloured-place",
        message: "coloured tokens are outside the IR",
        item,
      });
    }
    if (
      extensions.dynamics &&
      (place.dynamicsEnabled || place.differentialEquationId !== null)
    ) {
      diagnostics.errors.push({
        code: "place-dynamics",
        message: "continuous dynamics are outside the IR",
        item,
      });
    }
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

const effectiveLambdaType = (
  transition: Transition,
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
) =>
  getEffectiveTransitionLambdaType(
    transition,
    getTransitionLogicAvailability(transition, sdcpn, extensions),
  );

const netKind = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  netItem: PetriNetIrDiagnosticItem,
  diagnostics: Diagnostics,
): PetriNetIrKind | null => {
  const kinds = new Set(
    sdcpn.transitions.map((transition) =>
      effectiveLambdaType(transition, sdcpn, extensions),
    ),
  );
  if (kinds.size > 1) {
    diagnostics.errors.push({
      code: "mixed-transition-kinds",
      message:
        "the IR holds either predicate transitions or stochastic ones, and this net has both",
      item: netItem,
    });
    return null;
  }
  return kinds.has("stochastic") ? "stochastic" : "plain";
};

const initialTokens = (
  marking: InitialMarking[string] | undefined,
  item: PetriNetIrDiagnosticItem,
  diagnostics: Diagnostics,
): number => {
  if (marking === undefined) {
    return 0;
  }
  if (typeof marking !== "number") {
    // Token records belong to a coloured place, which is reported above.
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

/** The weight an arc entry already carries: none for a missing entry, one for a bare key. */
const weightOf = (entry: PetriNetIrArcs[string] | undefined): number =>
  entry === undefined ? 0 : (entry?.weight ?? 1);

/** An arc entry of the given weight: a bare key for one, a record otherwise. */
const withWeight = (total: number): PetriNetIrArcs[string] =>
  total === 1 ? null : { weight: total };

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
  lambdaHir: Readonly<Record<string, HirFunction | undefined>>;
  placeNames: ReadonlyMap<string, string>;
  names: IrNamePool;
};

type EvaluatedCondition =
  | { dead: false; rate?: number }
  | { dead: true; reason: string };

/**
 * Evaluates the condition to a firing rate (stochastic) or a live/dead
 * verdict (predicate). `null` means an error was reported, or that the
 * parameters are invalid and the verdict has to wait.
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
    return { dead: false };
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
    diagnostics.errors.push({
      code: evaluated.code,
      message: evaluated.message,
      item,
    });
    return null;
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
      ? { dead: false }
      : { dead: true, reason: "the predicate is false" };
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
    ? { dead: false, rate: value }
    : { dead: true, reason: `the rate is ${value}` };
};

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
  const constant = evaluateCondition(transition, context, item, diagnostics);

  const inputs: PetriNetIrArcs = {};
  const outputs: PetriNetIrArcs = {};
  for (const arc of transition.inputArcs) {
    if (arc.type !== "standard") {
      diagnostics.errors.push({
        code: "arc-kind-unsupported",
        message: `${arc.type} arcs are outside the IR, which holds standard arcs only`,
        item,
      });
      continue;
    }
    const place = resolvePlace(
      getArcEndpointPlaceId(arc),
      context.placeNames,
      item,
      diagnostics,
    );
    if (place !== null) {
      inputs[place] = withWeight(weightOf(inputs[place]) + arc.weight);
    }
  }
  for (const arc of transition.outputArcs) {
    const place = resolvePlace(
      getArcEndpointPlaceId(arc),
      context.placeNames,
      item,
      diagnostics,
    );
    if (place !== null) {
      outputs[place] = withWeight(weightOf(outputs[place]) + arc.weight);
    }
  }

  if (constant === null) {
    return null;
  }
  if (constant.dead) {
    diagnostics.warnings.push({
      code: "dead-transition",
      message: `${constant.reason}, so the transition is left out`,
      item,
    });
    return null;
  }

  const name = context.names.claim(transition.name || transition.id, "T");
  return {
    name,
    transition: {
      ...(Object.keys(inputs).length === 0 ? {} : { inputs }),
      ...(Object.keys(outputs).length === 0 ? {} : { outputs }),
      ...(constant.rate === undefined ? {} : { rate: constant.rate }),
    },
  };
};

/**
 * Turns a net into the Petri net IR, with its initial marking taken from
 * `initialMarking` and its conditions evaluated to constants against
 * `parameterValues`. Every reason the net cannot become an IR is reported as
 * an error; a transition that can never fire is left out with a warning.
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
  const kind = netKind(sdcpn, extensions, netItem, diagnostics);

  const names = createIrNamePool(RESERVED_MODULE_NAMES);
  const placeNames = new Map(
    sdcpn.places.map(
      (place) => [place.id, names.claim(place.name || place.id, "P")] as const,
    ),
  );
  const places: Record<string, PetriNetIrPlace> = {};
  for (const place of sdcpn.places) {
    const item: PetriNetIrDiagnosticItem = {
      kind: "place",
      id: place.id,
      name: place.name,
    };
    const initial = initialTokens(
      getOwn(input.initialMarking, place.id),
      item,
      diagnostics,
    );
    const capacity =
      typeof place.capacity === "number" &&
      Number.isInteger(place.capacity) &&
      place.capacity >= 0
        ? place.capacity
        : undefined;
    const entry: NonNullable<PetriNetIrPlace> = {
      ...(initial === 0 ? {} : { initial }),
      ...(capacity === undefined ? {} : { capacity }),
    };
    places[placeNames.get(place.id) ?? place.id] =
      Object.keys(entry).length === 0 ? null : entry;
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
        placeNames,
        names,
      },
      diagnostics,
    );
    if (lowered !== null) {
      transitions[lowered.name] = lowered.transition;
    }
  }

  if (diagnostics.errors.length > 0 || kind === null) {
    return { ok: false, ...diagnostics };
  }
  const description = sdcpn.description?.trim();
  return {
    ok: true,
    ir: {
      name: toIrNetName(input.title),
      ...(description === undefined || description === ""
        ? {}
        : { description }),
      kind,
      places,
      transitions,
    },
    warnings: diagnostics.warnings,
  };
};
