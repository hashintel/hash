/**
 * What a host lets an instance change. A host can keep an instance to
 * composing: placing instances of the components of the libraries it offers
 * in the root net, wiring their ports and arranging the canvas.
 */

import { mutationActionInputSchemas } from "../action-schemas";

import type { MutationHelperFunctions } from "../actions";
import type { CommandHelperFunctions } from "../commands";
import type { z } from "zod";

export type MutationName = keyof MutationHelperFunctions;
export type CommandName = keyof CommandHelperFunctions;

export type HostRules = {
  /** The ids of the libraries the host offers. */
  libraries: readonly string[];
  /** Whether the instance only composes components of those libraries. */
  compositionOnly: boolean;
};

type ParsedInput<Name extends MutationName> = z.output<
  (typeof mutationActionInputSchemas)[Name]
>;

/** Whether an import id names a library the host offers. */
type IsOffered = (importId: string) => boolean;

/**
 * The mutations that compose. `true` for one that composes whatever its
 * input, else what its input must satisfy. A mutation absent from here never
 * composes.
 */
const composing: {
  [Name in MutationName]?:
    | true
    | ((input: ParsedInput<Name>, isOffered: IsOffered) => boolean);
} = {
  addComponentInstance: ({ component }, isOffered) =>
    component !== undefined && isOffered(component.from),
  // An update may rename the instance or set its parameters; where it names
  // a component, that is one of a library on offer too.
  updateComponentInstance: ({ update }, isOffered) =>
    update.subnetId === undefined &&
    (update.component === undefined || isOffered(update.component.from)),
  updateComponentInstancePosition: true,
  removeComponentInstance: true,
  addFusion: true,
  updateFusion: true,
  removeFusion: true,
  addFusionMember: true,
  removeFusionMember: true,
  replaceFusionMember: true,
  deleteItemsByIds: ({ items }) =>
    items.every(
      ({ type }) => type === "componentInstance" || type === "fusion",
    ),
  commitNodePositions: true,
  updatePlacePosition: true,
  updateTransitionPosition: true,
};

const fieldOf = (input: unknown, key: string): unknown =>
  typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)[key]
    : undefined;

/** Whether a mutation composes: one of the composing mutations, on the root net. */
const composes = (
  name: MutationName,
  input: unknown,
  isOffered: IsOffered,
): boolean => {
  const allowed = composing[name];
  if (
    allowed === undefined ||
    typeof fieldOf(input, "targetSubnetId") === "string"
  ) {
    return false;
  }
  if (allowed === true) {
    return true;
  }
  const parsed = mutationActionInputSchemas[name].safeParse(input);
  // A malformed input is the mutation's to refuse, saying what is wrong.
  return !parsed.success || allowed(parsed.data as never, isOffered);
};

const composingOnlyNotice =
  "This editor only places and connects the components it is given";

/**
 * Why the host's rules refuse a mutation, as a sentence a user can read, or
 * `null` when they allow it. An instance that only composes refuses every
 * mutation that does not compose, and every one aimed at a subnet.
 */
export const mutationRefusal = (
  rules: HostRules,
  name: MutationName,
  input: unknown,
): string | null =>
  rules.compositionOnly &&
  !composes(name, input, (importId) => rules.libraries.includes(importId))
    ? `${composingOnlyNotice}.`
    : null;

/**
 * Why the host's rules refuse a command, or `null`. An instance that only
 * composes pastes nothing, since the clipboard carries places and
 * transitions, and lays out its root net alone.
 */
export const commandRefusal = (
  rules: HostRules,
  name: CommandName,
  input: unknown,
): string | null => {
  if (!rules.compositionOnly) {
    return null;
  }
  if (name === "applyClipboardPaste") {
    return `${composingOnlyNotice}: nothing can be pasted into it.`;
  }
  return typeof fieldOf(input, "targetSubnetId") === "string"
    ? `${composingOnlyNotice}.`
    : null;
};

/** The same functions, each throwing its refusal where `refusalOf` gives one. */
const guarded = <Functions extends Record<string, (input: never) => unknown>>(
  functions: Functions,
  refusalOf: (name: keyof Functions & string, input: unknown) => string | null,
): Functions =>
  Object.fromEntries(
    Object.entries(functions).map(([name, run]) => [
      name,
      (input: never) => {
        const refusal = refusalOf(name, input);
        if (refusal !== null) {
          throw new Error(`${refusal} Refused: \`${name}\`.`);
        }
        return run(input);
      },
    ]),
  ) as Functions;

/** The same mutations, each throwing its refusal where the host's rules give one. */
export const enforceHostRules = (
  mutations: MutationHelperFunctions,
  rules: HostRules,
): MutationHelperFunctions =>
  guarded(mutations, (name, input) => mutationRefusal(rules, name, input));

/** The same commands, held to the host's rules as the mutations are. */
export const enforceHostRulesOnCommands = (
  commands: CommandHelperFunctions,
  rules: HostRules,
): CommandHelperFunctions =>
  guarded(commands, (name, input) => commandRefusal(rules, name, input));
