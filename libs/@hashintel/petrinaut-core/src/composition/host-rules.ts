/**
 * What a host lets an instance change. The interfaces of the components a
 * host provides are the host's own: no mutation changes one.
 */

import { toPetrinautId } from "../petrinaut-id";

import type { MutationHelperFunctions } from "../actions";
import type { ID } from "../types/sdcpn";
import type { ProvidedInterfaces } from "./provided-components";

export type MutationName = keyof MutationHelperFunctions;

export type HostRules = {
  /** The interfaces of the components the host provides. */
  provided: ProvidedInterfaces;
};

/**
 * The subnet a mutation changes: the one it targets, or the one
 * `updateSubnet` names. `null` for the root net. Read off the input as it
 * came, since the mutation itself says what is wrong with a malformed one.
 */
const changedSubnetId = (name: MutationName, input: unknown): ID | null => {
  const key = name === "updateSubnet" ? "subnetId" : "targetSubnetId";
  const id =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)[key]
      : undefined;
  return typeof id === "string" ? toPetrinautId(id) : null;
};

/**
 * Why the host's rules refuse a mutation, as a sentence a user can read, or
 * `null` when they allow it.
 */
export const mutationRefusal = (
  rules: HostRules,
  name: MutationName,
  input: unknown,
): string | null => {
  const subnetId = changedSubnetId(name, input);
  const provided = subnetId === null ? undefined : rules.provided.get(subnetId);
  return provided
    ? `${provided.name} is a component the application provides: it cannot be changed.`
    : null;
};

/** The same mutations, each throwing its refusal where the host's rules give one. */
export const enforceHostRules = (
  mutations: MutationHelperFunctions,
  rules: HostRules,
): MutationHelperFunctions =>
  Object.fromEntries(
    Object.entries(mutations).map(([name, mutation]) => [
      name,
      (input: never) => {
        const refusal = mutationRefusal(rules, name as MutationName, input);
        if (refusal !== null) {
          throw new Error(`${refusal} Refused: \`${name}\`.`);
        }
        (mutation as (input: never) => void)(input);
      },
    ]),
  ) as MutationHelperFunctions;
