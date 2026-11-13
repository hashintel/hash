/**
 * What a host lets an instance change. The interfaces of the components a
 * host provides are the host's own: no mutation changes one. A host can also
 * keep an instance to composing: placing instances of those components in
 * the root net, wiring their ports and arranging the canvas.
 */

import { mutationActionInputSchemas } from "../action-schemas";
import { toPetrinautId } from "../petrinaut-id";
import {
  isProvidedInterface,
  type ProvidedInterfaces,
} from "./provided-components";

import type { MutationHelperFunctions } from "../actions";
import type { CommandHelperFunctions } from "../commands";
import type { ID, SDCPN, Subnet } from "../types/sdcpn";
import type { z } from "zod";

export type MutationName = keyof MutationHelperFunctions;
export type CommandName = keyof CommandHelperFunctions;

export type HostRules = {
  /** The interfaces of the components the host provides. */
  provided: ProvidedInterfaces;
  /** Whether the instance only composes those components. */
  compositionOnly: boolean;
};

type ParsedInput<Name extends MutationName> = z.output<
  (typeof mutationActionInputSchemas)[Name]
>;

/**
 * The mutations that compose. `true` for one that composes whatever its
 * input, else what its input must satisfy. A mutation absent from here never
 * composes.
 */
const composing: {
  [Name in MutationName]?:
    | true
    | ((input: ParsedInput<Name>, provided: ProvidedInterfaces) => boolean);
} = {
  addComponentInstance: ({ subnetId }, provided) => provided.has(subnetId),
  updateComponentInstance: ({ update }, provided) =>
    update.subnetId === undefined || provided.has(update.subnetId),
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
  provided: ProvidedInterfaces,
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
  return !parsed.success || allowed(parsed.data as never, provided);
};

/**
 * The subnet an input names under `key`, or `null` where it names none: the
 * root net. Read off the input as it came, since the mutation or the command
 * itself says what is wrong with a malformed one.
 */
const subnetIdAt = (input: unknown, key: string): ID | null => {
  const id = fieldOf(input, key);
  return typeof id === "string" ? toPetrinautId(id) : null;
};

/**
 * Where a mutation's input names the subnet it changes, or makes.
 * `removeSubnet` is left out on purpose: the document's copy can go, with
 * its instances.
 */
const changedSubnetKey = (name: MutationName): string => {
  if (name === "addSubnet") {
    return "id";
  }
  return name === "updateSubnet" ? "subnetId" : "targetSubnetId";
};

/**
 * The provided component `subnetId` names in `sdcpn`, or `undefined`. A
 * subnet of the document's own that has a provided id is not one: it is the
 * document's to change.
 */
const providedComponentAt = (
  rules: HostRules,
  sdcpn: SDCPN,
  subnetId: ID | null,
): Subnet | undefined => {
  const component =
    subnetId === null ? undefined : rules.provided.get(subnetId);
  const held = component && sdcpn.subnets?.find(({ id }) => id === subnetId);
  return held && !isProvidedInterface(held, rules.provided)
    ? undefined
    : component;
};

const providedRefusal = (
  rules: HostRules,
  sdcpn: SDCPN,
  subnetId: ID | null,
) => {
  const component = providedComponentAt(rules, sdcpn, subnetId);
  return component
    ? `${component.name} is a component the application provides: it cannot be changed.`
    : null;
};

const composingOnly =
  "This editor only places and connects the components it is given";

/**
 * Why the host's rules refuse a mutation of `sdcpn`, as a sentence a user can
 * read, or `null` when they allow it. A provided interface is not changed,
 * and no subnet is added under its id.
 */
export const mutationRefusal = (
  rules: HostRules,
  sdcpn: SDCPN,
  name: MutationName,
  input: unknown,
): string | null =>
  providedRefusal(rules, sdcpn, subnetIdAt(input, changedSubnetKey(name))) ??
  (rules.compositionOnly && !composes(name, input, rules.provided)
    ? `${composingOnly}.`
    : null);

/**
 * Why the host's rules refuse a command, or `null`. An instance that only
 * composes pastes nothing, since the clipboard carries places and
 * transitions, and lays out its root net alone.
 */
export const commandRefusal = (
  rules: HostRules,
  sdcpn: SDCPN,
  name: CommandName,
  input: unknown,
): string | null => {
  const subnetId = subnetIdAt(input, "targetSubnetId");
  const refusal = providedRefusal(rules, sdcpn, subnetId);
  if (refusal !== null || !rules.compositionOnly) {
    return refusal;
  }
  if (name === "applyClipboardPaste") {
    return `${composingOnly}: nothing can be pasted into it.`;
  }
  return subnetId === null ? null : `${composingOnly}.`;
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

/**
 * The same mutations, each throwing its refusal where the host's rules give
 * one. `readDocument` reads the document as each call finds it.
 */
export const enforceHostRules = (
  mutations: MutationHelperFunctions,
  rules: HostRules,
  readDocument: () => SDCPN,
): MutationHelperFunctions =>
  guarded(mutations, (name, input) =>
    mutationRefusal(rules, readDocument(), name, input),
  );

/** The same commands, held to the host's rules as the mutations are. */
export const enforceHostRulesOnCommands = (
  commands: CommandHelperFunctions,
  rules: HostRules,
  readDocument: () => SDCPN,
): CommandHelperFunctions =>
  guarded(commands, (name, input) =>
    commandRefusal(rules, readDocument(), name, input),
  );
