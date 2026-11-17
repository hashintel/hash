/**
 * The rules a host sets on an instance, and what they refuse. Every reader
 * asks a function of this module and none looks into the rules itself, so a
 * rule is added here and nowhere else.
 */

import { mutationActionInputSchemas } from "../action-schemas";

import type { MutationHelperFunctions } from "../actions";
import type { CommandHelperFunctions } from "../commands";
import type { ComponentReference } from "../types/sdcpn";
import type { z } from "zod";

/** The rules a host sets on an instance. A rule left out takes its default. */
export type PetrinautRules = {
  /**
   * What the instance edits. `"all"`, the default, is everything.
   * `"compose"` keeps it to composing: placing instances of the components
   * of the libraries on offer in the root net, wiring their ports with
   * fusions, and arranging the canvas.
   */
  readonly edit?: "all" | "compose";
};

type MutationName = keyof MutationHelperFunctions;
type CommandName = keyof CommandHelperFunctions;

/** Whether the rules keep an instance to composing. */
export const composesOnly = (rules: PetrinautRules): boolean =>
  rules.edit === "compose";

/** Whether two sets of rules say the same, whatever objects hold them. */
export const sameRules = (
  first: PetrinautRules,
  second: PetrinautRules,
): boolean => composesOnly(first) === composesOnly(second);

type ParsedInput<Name extends MutationName> = z.output<
  (typeof mutationActionInputSchemas)[Name]
>;

/** Whether an import id names a library the host offers. */
type IsOffered = (importId: string) => boolean;

const isOfLibraryOnOffer = (
  { from }: ComponentReference,
  isOffered: IsOffered,
): boolean => from !== undefined && isOffered(from);

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
  // The implementation an instance chooses runs in its place: it is a
  // component of a library on offer as well.
  addComponentInstance: ({ component, implementation }, isOffered) =>
    component !== undefined &&
    isOffered(component.from) &&
    (implementation === undefined ||
      isOfLibraryOnOffer(implementation, isOffered)),
  // An update may rename the instance or set its parameters; where it names
  // a component or an implementation, that is one of a library on offer too.
  // One that clears its choice names none.
  updateComponentInstance: ({ update }, isOffered) =>
    update.componentId === undefined &&
    (update.component === undefined || isOffered(update.component.from)) &&
    (update.implementation == null ||
      isOfLibraryOnOffer(update.implementation, isOffered)),
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
    typeof fieldOf(input, "targetComponentId") === "string"
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
 * Why the rules refuse a mutation, as a sentence a user can read, or `null`
 * when they allow it. `libraries` are the ids of the libraries on offer. An
 * instance kept to composing refuses every mutation that does not compose,
 * and every one aimed at a component.
 */
export const mutationRefusal = (
  rules: PetrinautRules,
  libraries: readonly string[],
  name: MutationName,
  input: unknown,
): string | null =>
  composesOnly(rules) &&
  !composes(name, input, (importId) => libraries.includes(importId))
    ? `${composingOnlyNotice}.`
    : null;

/**
 * Why the rules refuse a command, or `null`. An instance kept to composing
 * pastes nothing, since the clipboard carries places and transitions, and
 * lays out its root net alone.
 */
export const commandRefusal = (
  rules: PetrinautRules,
  name: CommandName,
  input: unknown,
): string | null => {
  if (!composesOnly(rules)) {
    return null;
  }
  if (name === "applyClipboardPaste") {
    return `${composingOnlyNotice}: nothing can be pasted into it.`;
  }
  return typeof fieldOf(input, "targetComponentId") === "string"
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

/** The same mutations, each throwing its refusal where the rules give one. */
export const enforceHostRules = (
  mutations: MutationHelperFunctions,
  rules: PetrinautRules,
  libraries: readonly string[],
): MutationHelperFunctions =>
  guarded(mutations, (name, input) =>
    mutationRefusal(rules, libraries, name, input),
  );

/** The same commands, held to the rules as the mutations are. */
export const enforceHostRulesOnCommands = (
  commands: CommandHelperFunctions,
  rules: PetrinautRules,
): CommandHelperFunctions =>
  guarded(commands, (name, input) => commandRefusal(rules, name, input));
