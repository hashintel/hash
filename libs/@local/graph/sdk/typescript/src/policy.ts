import type { ActorId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  Policy,
  PolicyFilter,
  PolicyId,
} from "@rust/hash-graph-authorization/types";

import type { AuthenticationContext } from "./authentication-context.js";

/**
 * Retrieves a policy by its ID.
 */
export const getPolicyById = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  policyId: PolicyId,
): Promise<Policy | undefined> =>
  graphAPI
    .getPolicyById(authentication.actorId, policyId)
    .then(({ data: policy }) => (policy as Policy | null) ?? undefined);

/**
 * Queries for policies in the local store that match the provided filter.
 *
 * This method queries the underlying policy store using the given [`PolicyFilter`] and returns
 * a list of matching [`Policy`] objects. The filter can be used to specify criteria such as
 * policy type, subject, resource, or action.
 *
 * Note that this does not resolve indirect policies (e.g., policies applying to roles held by
 * a specific actor). For resolving all policies applicable to an actor, including indirect
 * ones, use `resolvePoliciesForActor`.
 */
export const queryPolicies = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  filter: PolicyFilter,
): Promise<Policy[]> =>
  graphAPI
    .queryPolicies(authentication.actorId, filter)
    .then(({ data: policies }) => policies as Policy[]);

/**
 * Searches for policies that apply to the given actor.
 *
 * This method queries the underlying policy store to find policies that are relevant to the
 * specified actor. The policies returned may include those that apply to the actor directly,
 * as well as policies that apply to any roles the actor has.
 *
 * This provides a complete set of policies that apply to an actor, including all policies that
 *   - apply to the actor itself,
 *   - apply to the actor's roles,
 *   - apply to the actor's groups, and
 *   - apply to the actor's parent groups (for teams).
 */
export const resolvePoliciesForActor = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  actorId: ActorId,
): Promise<Policy[]> =>
  graphAPI
    .resolvePoliciesForActor(authentication.actorId, actorId)
    .then(({ data: policies }) => policies as Policy[]);
