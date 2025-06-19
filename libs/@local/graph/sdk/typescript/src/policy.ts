import type { GraphApi } from "@local/hash-graph-client";
import type {
  Policy,
  PolicyCreationParams,
  PolicyFilter,
  PolicyId,
  PolicyUpdateOperation,
} from "@rust/hash-graph-authorization/types";

import type { AuthenticationContext } from "./authentication-context.js";

/**
 * Creates a new policy in the backing store.
 *
 * Inserts the [`Policy`] as specified in the [`PolicyCreationParams`] and returns its
 * [`PolicyId`] if successful. The implementation must ensure the referenced principal
 * exists and the policy has at least one action.
 */
export const createPolicy = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  policy: PolicyCreationParams,
): Promise<PolicyId> =>
  graphAPI
    .createPolicy(authentication.actorId, policy)
    .then(({ data: policyId }) => policyId as PolicyId);

/**
 * Retrieves a policy by its ID.
 *
 * Returns the policy if it exists, or `null` if not found.
 */
export const getPolicyById = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  policyId: PolicyId,
): Promise<Policy | null> =>
  graphAPI
    .getPolicyById(authentication.actorId, policyId)
    .then(({ data: policy }) => policy as Policy | null);

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
 * Updates the policy specified by its ID.
 *
 * All specified operations are applied to the policy in the order they are provided.
 */
export const updatePolicyById = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  policyId: PolicyId,
  operations: PolicyUpdateOperation[],
): Promise<Policy> =>
  graphAPI
    .updatePolicyById(authentication.actorId, policyId, operations)
    .then(({ data: policy }) => policy as Policy);

/**
 * Removes the policy specified by its ID.
 *
 * @todo Remove the `archive` parameter when temporary policies are not required anymore
 */
export const deletePolicyById = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  policyId: PolicyId,
  options: { permanent: boolean } = { permanent: false },
): Promise<void> =>
  (options.permanent
    ? graphAPI.deletePolicyById(authentication.actorId, policyId)
    : graphAPI.archivePolicyById(authentication.actorId, policyId)
  ).then(({ data }) => data);
