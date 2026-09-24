import { dump } from "js-yaml";

/**
 * The Petri net IR: one net as plain data, with places, weighted arcs, the
 * initial marking, the firing rate or guard of each transition and, for a
 * coloured net, the token colours, the kernels that write tokens and the
 * dynamics that move them between steps. Code appears only as the bare-body
 * TypeScript the HIR printer writes, with the net's parameters inlined, so
 * the document carries no parameters and no layout and is stable across
 * Petrinaut file-format changes. An optional `zeroth` section carries the
 * flags a reactive-module compiler reads, so the document alone reproduces
 * its output.
 *
 * Places, transitions, colours, dynamics, the arcs of a transition and the
 * marking are records keyed by name. A name is UpperCamelCase, so it is
 * unique within its record and usable as a variable name in generated code.
 * A field at its default is left out, and an entry with every field at its
 * default is `null`, which the YAML rendering writes as a bare key.
 */

/** A place, transition or arc key. */
export const PETRI_NET_IR_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/u;

/** The net's own name, which a compiler derives a module name from. */
export const PETRI_NET_IR_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/**
 * Whether every transition fires when enabled (`plain`), every transition
 * fires at a rate (`stochastic`), or the net has both (`mixed`). A
 * transition with a `rate` is stochastic; one without fires when its guard
 * holds.
 */
export type PetriNetIrKind = "plain" | "stochastic" | "mixed";

/**
 * Bare-body TypeScript for one of Petrinaut's code surfaces, as the HIR
 * printer writes it: the statements alone, ending in `return`, with the
 * input object ambient (`input` for a guard, rate or kernel, `tokens` for
 * dynamics) and the net's parameters inlined.
 */
export type PetriNetIrCode = string;

/**
 * A token attribute's type. A string attribute the net only ever writes
 * from a finite set of literals is closed to that set as `{ enum }`, in
 * first-seen order, so a compiler can number the values.
 */
export type PetriNetIrAttribute =
  | "real"
  | "integer"
  | "boolean"
  | "uuid"
  | "string"
  | { enum: string[] };

/** A colour: its attributes keyed by name, in declaration order. */
export type PetriNetIrColour = Record<string, PetriNetIrAttribute>;

/** A differential equation shared by the places that name it. */
export type PetriNetIrDynamics = {
  /** The colour whose tokens it moves. */
  colour: string;
  /**
   * The `dynamics` surface: `return tokens.map((token) => ({ attribute:
   * derivative, ... }));`, one derivative per real attribute it moves.
   */
  code: PetriNetIrCode;
};

/**
 * One arc keyed by its place; `null` is a standard arc of weight one. A
 * `read` arc needs the place to hold the weight and leaves it alone; an
 * `inhibitor` arc needs the place to hold fewer. Input arcs keep the order
 * the model gives them, which is the order token bindings are enumerated in.
 */
export type PetriNetIrArc = {
  weight?: number;
  kind?: "read" | "inhibitor";
} | null;

export type PetriNetIrArcs = Record<string, PetriNetIrArc>;

/** A place; `null` holds any number of plain tokens. */
export type PetriNetIrPlace = {
  /** Maximum tokens the place holds. Absent means unbounded. */
  capacity?: number;
  /** The colour of the tokens it holds. Absent means plain counting tokens. */
  colour?: string;
  /** The `dynamics` entry that moves its tokens between steps. */
  dynamics?: string;
} | null;

export type PetriNetIrTokenValue = number | boolean | string;

/** One token of a coloured place, its attributes keyed by name. */
export type PetriNetIrToken = Record<string, PetriNetIrTokenValue>;

/**
 * Tokens each place starts with, keyed by place: a count for a plain
 * place, one record per token for a coloured one. A place absent here
 * starts empty.
 */
export type PetriNetIrMarking = Record<string, number | PetriNetIrToken[]>;

export type PetriNetIrTransition = {
  /** Input arcs keyed by place, in binding order. Absent means none. */
  inputs?: PetriNetIrArcs;
  /** Output arcs keyed by place: tokens the firing produces. Absent means none. */
  outputs?: PetriNetIrArcs;
  /**
   * A predicate transition's condition over its input tokens, a `lambda`
   * surface returning a boolean. Absent means the transition fires whenever
   * its arcs allow it.
   */
  guard?: PetriNetIrCode;
  /**
   * A stochastic transition's mean firings per time unit while enabled: a
   * constant, or a `lambda` surface returning it from the input tokens.
   */
  rate?: number | PetriNetIrCode;
  /**
   * The `kernel` surface that writes the produced tokens' attributes.
   * Present when an output place is coloured.
   */
  kernel?: PetriNetIrCode;
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
  /**
   * Step length: a rate is tested over it, and dynamics take one Euler
   * step of it. Stochastic nets and nets with dynamics.
   */
  dt?: number;
  /**
   * Coloured nets only: the slots a coloured place without a capacity gets.
   * A produced token that finds no free slot sets the place's overflow flag.
   */
  slots?: number;
  /**
   * Modular shape only. `single`: one Python file holds the variables, the
   * modules and the system. `per-module`: each module class has a file of
   * its own, and `net.py` declares the variables, imports the modules and
   * composes them.
   */
  layout?: "single" | "per-module";
};

export type ResolvedZerothTarget = Required<ZerothTarget>;

export const ZEROTH_TARGET_DEFAULTS: ResolvedZerothTarget = {
  shape: "monolithic",
  marking: "real",
  control: "closed",
  dt: 1,
  slots: 8,
  layout: "single",
};

/** Every flag, the document's value or the default. */
export const resolveZerothTarget = (
  target: ZerothTarget | undefined,
): ResolvedZerothTarget => ({
  shape: target?.shape ?? ZEROTH_TARGET_DEFAULTS.shape,
  marking: target?.marking ?? ZEROTH_TARGET_DEFAULTS.marking,
  control: target?.control ?? ZEROTH_TARGET_DEFAULTS.control,
  dt: target?.dt ?? ZEROTH_TARGET_DEFAULTS.dt,
  slots: target?.slots ?? ZEROTH_TARGET_DEFAULTS.slots,
  layout: target?.layout ?? ZEROTH_TARGET_DEFAULTS.layout,
});

/**
 * The flags a document carries for a net: the ones off their default, and
 * only those that apply to the net. `marking` belongs to a stochastic net
 * without colours, `dt` to a net with rates or dynamics, `control` to a net
 * with a controllable transition, `slots` to a net with a coloured place,
 * `layout` to the modular shape. `undefined` when every flag is at its
 * default.
 */
export const zerothTargetForNet = (
  target: ZerothTarget | undefined,
  net: Pick<PetriNetIr, "kind" | "places" | "transitions">,
): ZerothTarget | undefined => {
  const resolved = resolveZerothTarget(target);
  const stochastic = net.kind !== "plain";
  const places = Object.values(net.places);
  const coloured = places.some((place) => place?.colour !== undefined);
  const dynamic = places.some((place) => place?.dynamics !== undefined);
  const controllable = Object.values(net.transitions).some(
    (transition) => transition.controllable === true,
  );
  const section: ZerothTarget = {
    ...(resolved.shape === ZEROTH_TARGET_DEFAULTS.shape
      ? {}
      : { shape: resolved.shape }),
    ...(stochastic &&
    !coloured &&
    resolved.marking !== ZEROTH_TARGET_DEFAULTS.marking
      ? { marking: resolved.marking }
      : {}),
    ...(controllable && resolved.control !== ZEROTH_TARGET_DEFAULTS.control
      ? { control: resolved.control }
      : {}),
    ...((stochastic || dynamic) && resolved.dt !== ZEROTH_TARGET_DEFAULTS.dt
      ? { dt: resolved.dt }
      : {}),
    ...(coloured && resolved.slots !== ZEROTH_TARGET_DEFAULTS.slots
      ? { slots: resolved.slots }
      : {}),
    ...(resolved.shape === "modular" &&
    resolved.layout !== ZEROTH_TARGET_DEFAULTS.layout
      ? { layout: resolved.layout }
      : {}),
  };
  return Object.keys(section).length === 0 ? undefined : section;
};

export type PetriNetIr = {
  name: string;
  description?: string;
  kind: PetriNetIrKind;
  /** Token colours keyed by name. Absent when every place is plain. */
  colours?: Record<string, PetriNetIrColour>;
  /** Differential equations keyed by name. Absent when no place has dynamics. */
  dynamics?: Record<string, PetriNetIrDynamics>;
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

export const petriNetIrArcKind = (
  arc: PetriNetIrArc,
): "standard" | "read" | "inhibitor" => arc?.kind ?? "standard";

/** The tokens a place starts with: its count, or the number of its records. */
export const petriNetIrInitialTokens = (
  ir: Pick<PetriNetIr, "marking">,
  place: string,
): number => {
  const marking = ir.marking?.[place];
  return marking === undefined
    ? 0
    : typeof marking === "number"
      ? marking
      : marking.length;
};

/** A transition fires at a rate when it has one, and on its guard otherwise. */
export const petriNetIrTransitionIsStochastic = (
  transition: PetriNetIrTransition,
): boolean => transition.rate !== undefined;

/** The kind the transitions give the net: no rates, every rate, or some. */
export const petriNetIrKindOf = (
  transitions: Record<string, PetriNetIrTransition>,
): PetriNetIrKind => {
  const entries = Object.values(transitions);
  const stochastic = entries.filter(petriNetIrTransitionIsStochastic).length;
  return stochastic === 0
    ? "plain"
    : stochastic === entries.length
      ? "stochastic"
      : "mixed";
};

export const petriNetIrPlaceCapacity = (
  place: PetriNetIrPlace,
): number | undefined => place?.capacity;

/**
 * A section as block-style YAML. Lines are never folded, so a code line
 * stays one line; a record nested `flowLevel` deep is written in flow style,
 * which keeps a token's attributes on one line.
 */
const renderSection = (section: object, flowLevel = -1): string =>
  dump(section, {
    flowLevel,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    styles: { "!!null": "empty" },
  }).replace(/: $/gmu, ":");

/** Code ends in a newline, so js-yaml writes it as a `|` literal block. */
const asBlock = (code: PetriNetIrCode): PetriNetIrCode =>
  code.endsWith("\n") ? code : `${code}\n`;

const withBlockCode = (
  transitions: Record<string, PetriNetIrTransition>,
): Record<string, PetriNetIrTransition> =>
  Object.fromEntries(
    Object.entries(transitions).map(([name, transition]) => [
      name,
      {
        ...transition,
        ...(transition.guard === undefined
          ? {}
          : { guard: asBlock(transition.guard) }),
        ...(typeof transition.rate === "string"
          ? { rate: asBlock(transition.rate) }
          : {}),
        ...(transition.kernel === undefined
          ? {}
          : { kernel: asBlock(transition.kernel) }),
      },
    ]),
  );

type Section = { content: object; flowLevel?: number };

/**
 * Renders an IR as block-style YAML, one field per line, with a blank line
 * between the header and each of the `colours`, `dynamics`, `places`,
 * `marking`, `transitions` and `zeroth` sections. A `null` entry is written
 * as a bare key: `B:` is a place with every field at its default. Code is
 * written as a literal block, and a token's attributes on one line.
 */
export const renderPetriNetIr = (ir: PetriNetIr): string => {
  const {
    colours,
    description,
    dynamics,
    kind,
    marking,
    name,
    places,
    transitions,
    zeroth,
  } = ir;
  const sections: Section[] = [
    {
      content: {
        name,
        ...(description === undefined ? {} : { description }),
        kind,
      },
    },
    ...(colours === undefined ? [] : [{ content: { colours } }]),
    ...(dynamics === undefined
      ? []
      : [
          {
            content: {
              dynamics: Object.fromEntries(
                Object.entries(dynamics).map(([key, entry]) => [
                  key,
                  { ...entry, code: asBlock(entry.code) },
                ]),
              ),
            },
          },
        ]),
    { content: { places } },
    ...(marking === undefined ? [] : [{ content: { marking }, flowLevel: 3 }]),
    { content: { transitions: withBlockCode(transitions) } },
    ...(zeroth === undefined ? [] : [{ content: { zeroth } }]),
  ];
  return sections
    .map((section) => renderSection(section.content, section.flowLevel))
    .join("\n");
};
