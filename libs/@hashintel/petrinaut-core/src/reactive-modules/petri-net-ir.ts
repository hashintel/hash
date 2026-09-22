import { dump } from "js-yaml";

/**
 * The Petri net IR: one net as plain data, with places, weighted standard
 * arcs and, for a stochastic net, one firing rate per transition. It carries
 * no code, no parameters and no layout, so it is stable across Petrinaut
 * file-format changes and small enough for another tool to read.
 *
 * Places, transitions and the arcs of a transition are records keyed by
 * name. A name is UpperCamelCase, so it is unique within its record and
 * usable as a variable name in generated code. A field at its default is
 * left out, and an entry with every field at its default is `null`, which
 * the YAML rendering writes as a bare key.
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

/** A place; `null` starts empty and holds any number of tokens. */
export type PetriNetIrPlace = {
  /** Tokens at the start. Absent means none. */
  initial?: number;
  /** Maximum tokens the place holds. Absent means unbounded. */
  capacity?: number;
} | null;

export type PetriNetIrTransition = {
  /** Standard input arcs keyed by place. Absent means none. */
  inputs?: PetriNetIrArcs;
  /** Output arcs keyed by place. Absent means none. */
  outputs?: PetriNetIrArcs;
  /** Stochastic nets only: mean firings per time unit while enabled. */
  rate?: number;
};

export type PetriNetIr = {
  name: string;
  description?: string;
  kind: PetriNetIrKind;
  places: Record<string, PetriNetIrPlace>;
  /** Record order is the order a step sweeps the transitions in. */
  transitions: Record<string, PetriNetIrTransition>;
};

export const petriNetIrArcWeight = (arc: PetriNetIrArc): number =>
  arc?.weight ?? 1;

export const petriNetIrPlaceInitial = (place: PetriNetIrPlace): number =>
  place?.initial ?? 0;

export const petriNetIrPlaceCapacity = (
  place: PetriNetIrPlace,
): number | undefined => place?.capacity;

/**
 * Renders an IR as block-style YAML, one field per line. A `null` entry is
 * written as a bare key: `B:` is a place with every field at its default.
 */
export const renderPetriNetIr = (ir: PetriNetIr): string =>
  dump(ir, {
    flowLevel: -1,
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
    styles: { "!!null": "empty" },
  }).replace(/: $/gmu, ":");
