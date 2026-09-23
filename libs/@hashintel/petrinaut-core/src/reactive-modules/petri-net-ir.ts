import { dump } from "js-yaml";

/**
 * The Petri net IR: one net as plain data, with places, weighted standard
 * arcs, the initial marking and, for a stochastic net, one firing rate per
 * transition. It carries no code, no parameters and no layout, so it is
 * stable across Petrinaut file-format changes and small enough for another
 * tool to read. An optional `zeroth` section carries the flags a reactive-
 * module compiler reads, so the document alone reproduces its output.
 *
 * Places, transitions, the arcs of a transition and the marking are records
 * keyed by name. A name is UpperCamelCase, so it is unique within
 * its record and usable as a variable name in generated code. A field at its
 * default is left out, and an entry with every field at its default is
 * `null`, which the YAML rendering writes as a bare key.
 */

/** A place, transition or arc key. */
export const PETRI_NET_IR_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/u;

/** The net's own name, which a compiler derives a module name from. */
export const PETRI_NET_IR_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/**
 * Whether every transition fires when enabled (`plain`) or at a rate
 * (`stochastic`). A net mixes neither.
 */
export type PetriNetIrKind = "plain" | "stochastic";

/** One arc keyed by its place; `null` carries one token. */
export type PetriNetIrArc = { weight: number } | null;

export type PetriNetIrArcs = Record<string, PetriNetIrArc>;

/** A place; `null` holds any number of tokens. */
export type PetriNetIrPlace = {
  /** Maximum tokens the place holds. Absent means unbounded. */
  capacity?: number;
} | null;

/** Tokens each place starts with, keyed by place. A place absent here starts empty. */
export type PetriNetIrMarking = Record<string, number>;

export type PetriNetIrTransition = {
  /** Standard input arcs keyed by place. Absent means none. */
  inputs?: PetriNetIrArcs;
  /** Output arcs keyed by place. Absent means none. */
  outputs?: PetriNetIrArcs;
  /** Stochastic nets only: mean firings per time unit while enabled. */
  rate?: number;
  /**
   * The model marks the firing as a choice a controller makes. Absent means
   * the transition fires whenever it is enabled.
   */
  controllable?: true;
};

/**
 * How a Zeroth reactive-module compiler shapes its output. Each flag names
 * a strategy with a default that reproduces a Petrinaut step in one module;
 * a flag at its default is left out of the document.
 */
export type ZerothTarget = {
  /**
   * `monolithic`: one module holds the whole step. `modular`: one module per
   * transition drives a firing flag, one module per place awaits the flags
   * of its transitions, and the modules are composed.
   */
  shape?: "monolithic" | "modular";
  /**
   * Stochastic nets only. `real`: every place is a Real and each guard tests
   * its own uniform draw. `int`: places are Int, and one LRA module per
   * transition turns its draw into a Bool flag the guard reads.
   */
  marking?: "real" | "int";
  /**
   * `closed`: a controllable transition fires whenever it is enabled, as in
   * Petrinaut. `open`: it also waits for an external Bool choice, so the
   * module is open to a controller.
   */
  control?: "closed" | "open";
  /** Stochastic nets only: step length a rate is tested over. */
  dt?: number;
};

export type ResolvedZerothTarget = Required<ZerothTarget>;

export const ZEROTH_TARGET_DEFAULTS: ResolvedZerothTarget = {
  shape: "monolithic",
  marking: "real",
  control: "closed",
  dt: 1,
};

/** Every flag, the document's value or the default. */
export const resolveZerothTarget = (
  target: ZerothTarget | undefined,
): ResolvedZerothTarget => ({
  shape: target?.shape ?? ZEROTH_TARGET_DEFAULTS.shape,
  marking: target?.marking ?? ZEROTH_TARGET_DEFAULTS.marking,
  control: target?.control ?? ZEROTH_TARGET_DEFAULTS.control,
  dt: target?.dt ?? ZEROTH_TARGET_DEFAULTS.dt,
});

/**
 * The flags a document carries for a net: the ones off their default, and
 * only those that apply to the net. `marking` and `dt` belong to a
 * stochastic net, `control` to a net with a controllable transition.
 * `undefined` when every flag is at its default.
 */
export const zerothTargetForNet = (
  target: ZerothTarget | undefined,
  net: Pick<PetriNetIr, "kind" | "transitions">,
): ZerothTarget | undefined => {
  const resolved = resolveZerothTarget(target);
  const stochastic = net.kind === "stochastic";
  const controllable = Object.values(net.transitions).some(
    (transition) => transition.controllable === true,
  );
  const section: ZerothTarget = {
    ...(resolved.shape === ZEROTH_TARGET_DEFAULTS.shape
      ? {}
      : { shape: resolved.shape }),
    ...(stochastic && resolved.marking !== ZEROTH_TARGET_DEFAULTS.marking
      ? { marking: resolved.marking }
      : {}),
    ...(controllable && resolved.control !== ZEROTH_TARGET_DEFAULTS.control
      ? { control: resolved.control }
      : {}),
    ...(stochastic && resolved.dt !== ZEROTH_TARGET_DEFAULTS.dt
      ? { dt: resolved.dt }
      : {}),
  };
  return Object.keys(section).length === 0 ? undefined : section;
};

export type PetriNetIr = {
  name: string;
  description?: string;
  kind: PetriNetIrKind;
  places: Record<string, PetriNetIrPlace>;
  /** The initial marking. Absent when every place starts empty. */
  marking?: PetriNetIrMarking;
  /** Record order is the order a step sweeps the transitions in. */
  transitions: Record<string, PetriNetIrTransition>;
  /** Flags for a Zeroth reactive-module compiler. Absent means every default. */
  zeroth?: ZerothTarget;
};

export const petriNetIrArcWeight = (arc: PetriNetIrArc): number =>
  arc?.weight ?? 1;

export const petriNetIrInitialTokens = (
  ir: Pick<PetriNetIr, "marking">,
  place: string,
): number => ir.marking?.[place] ?? 0;

export const petriNetIrPlaceCapacity = (
  place: PetriNetIrPlace,
): number | undefined => place?.capacity;

const renderSection = (section: object): string =>
  dump(section, {
    flowLevel: -1,
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
    styles: { "!!null": "empty" },
  }).replace(/: $/gmu, ":");

/**
 * Renders an IR as block-style YAML, one field per line, with a blank line
 * between the header and each of the `places`, `marking`, `transitions` and
 * `zeroth` sections. A `null` entry is written as a bare key: `B:` is a
 * place with every field at its default.
 */
export const renderPetriNetIr = (ir: PetriNetIr): string => {
  const { description, kind, marking, name, places, transitions, zeroth } = ir;
  const sections = [
    { name, ...(description === undefined ? {} : { description }), kind },
    { places },
    ...(marking === undefined ? [] : [{ marking }]),
    { transitions },
    ...(zeroth === undefined ? [] : [{ zeroth }]),
  ];
  return sections.map(renderSection).join("\n");
};
