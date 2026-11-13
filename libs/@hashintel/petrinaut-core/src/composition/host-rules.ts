/**
 * What a host lets an instance change. The interfaces of the components a
 * host provides are the host's own: no mutation changes one.
 */

import { toPetrinautId } from "../petrinaut-id";

import type { MutationHelperFunctions } from "../actions";
import type { CommandHelperFunctions } from "../commands";
import type { ID } from "../types/sdcpn";
import type { ProvidedInterfaces } from "./provided-components";

export type MutationName = keyof MutationHelperFunctions;
export type CommandName = keyof CommandHelperFunctions;

export type HostRules = {
  /** The interfaces of the components the host provides. */
  provided: ProvidedInterfaces;
};

/**
 * The subnet an input names under `key`, or `null` where it names none: the
 * root net. Read off the input as it came, since the mutation or the command
 * itself says what is wrong with a malformed one.
 */
const subnetIdAt = (input: unknown, key: string): ID | null => {
  const id =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)[key]
      : undefined;
  return typeof id === "string" ? toPetrinautId(id) : null;
};

/** Where a mutation's input names the subnet it changes, or makes. */
const changedSubnetKey = (name: MutationName): string => {
  if (name === "addSubnet") {
    return "id";
  }
  return name === "updateSubnet" ? "subnetId" : "targetSubnetId";
};

const providedRefusal = (rules: HostRules, subnetId: ID | null) => {
  const provided = subnetId === null ? undefined : rules.provided.get(subnetId);
  return provided
    ? `${provided.name} is a component the application provides: it cannot be changed.`
    : null;
};

/**
 * Why the host's rules refuse a mutation, as a sentence a user can read, or
 * `null` when they allow it. A provided interface is not changed, and no
 * subnet is added under its id.
 */
export const mutationRefusal = (
  rules: HostRules,
  name: MutationName,
  input: unknown,
): string | null =>
  providedRefusal(rules, subnetIdAt(input, changedSubnetKey(name)));

/** Why the host's rules refuse a command on the net it targets, or `null`. */
export const commandRefusal = (
  rules: HostRules,
  _name: CommandName,
  input: unknown,
): string | null => providedRefusal(rules, subnetIdAt(input, "targetSubnetId"));

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
