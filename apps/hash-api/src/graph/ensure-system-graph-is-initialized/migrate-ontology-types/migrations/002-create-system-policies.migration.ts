import {
  createPolicy,
  deletePolicyById,
  queryPolicies,
} from "@local/hash-graph-sdk/policy";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  EntityTypeResourceFilter,
  PolicyCreationParams,
} from "@rust/hash-graph-authorization/types";

import type { MigrationFunction } from "../types";

const MACHINE_INSTANTIATE_ONLY_FILTERS: EntityTypeResourceFilter[] = [
  {
    type: "isBaseUrl",
    baseUrl: systemEntityTypes.actor.entityTypeBaseUrl,
  },
  {
    type: "isBaseUrl",
    baseUrl: systemEntityTypes.machine.entityTypeBaseUrl,
  },
  {
    type: "isBaseUrl",
    baseUrl: systemEntityTypes.user.entityTypeBaseUrl,
  },
  {
    type: "isBaseUrl",
    baseUrl: systemEntityTypes.organization.entityTypeBaseUrl,
  },
];

// A global policy that allows all users to instantiate any entity type
// except for the base URL of the hash instance and machine entity types
// (which are only allowed to be instantiated by machines).
const PUBLIC_INSTANTIATE_POLICY: PolicyCreationParams = {
  name: "instantiate",
  effect: "permit",
  principal: null,
  actions: ["instantiate"],
  resource: {
    type: "entityType",
    filter: {
      type: "not",
      filter: {
        type: "any",
        filters: [
          {
            type: "isBaseUrl",
            baseUrl: systemEntityTypes.hashInstance.entityTypeBaseUrl,
          },
          ...MACHINE_INSTANTIATE_ONLY_FILTERS,
        ],
      },
    },
  },
};

const MACHINE_INSTANTIATE_POLICY: PolicyCreationParams = {
  name: "instantiate",
  effect: "permit",
  principal: {
    type: "actorType",
    actorType: "machine",
  },
  actions: ["instantiate"],
  resource: {
    type: "entityType",
    filter: {
      type: "any",
      filters: MACHINE_INSTANTIATE_ONLY_FILTERS,
    },
  },
};

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  for (const policy of [
    PUBLIC_INSTANTIATE_POLICY,
    MACHINE_INSTANTIATE_POLICY,
  ]) {
    const [existingPolicy] = await queryPolicies(
      context.graphApi,
      authentication,
      {
        name: policy.name,
        principal: policy.principal
          ? { filter: "constrained", ...policy.principal }
          : { filter: "unconstrained" },
      },
    );

    if (existingPolicy) {
      // TODO: Properly update the policy to match the new one
      await deletePolicyById(
        context.graphApi,
        authentication,
        existingPolicy.id,
      );
    }

    await createPolicy(context.graphApi, authentication, policy);
  }

  return migrationState;
};

export default migrate;
