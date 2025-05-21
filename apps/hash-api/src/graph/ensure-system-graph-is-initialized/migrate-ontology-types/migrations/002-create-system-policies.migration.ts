import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityTypeResourceFilter } from "@rust/hash-graph-authorization/types";

import type { MigrationFunction } from "../types";
import {
  createOrUpgradePolicies,
  type NamedPartialPolicy,
} from "../util/upgrade-policies";

const MACHINE_ONLY_INSTANTIATE_FILTERS: EntityTypeResourceFilter[] = [
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
const AUTHENTICATED_INSTANTIATE_POLICY: NamedPartialPolicy = {
  name: "authenticated-instantiate",
  effect: "permit",
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
          ...MACHINE_ONLY_INSTANTIATE_FILTERS,
        ],
      },
    },
  },
};

const MACHINE_ONLY_INSTANTIATE_POLICY: NamedPartialPolicy = {
  name: "machine-only-instantiate",
  effect: "permit",
  actions: ["instantiate"],
  resource: {
    type: "entityType",
    filter: {
      type: "any",
      filters: MACHINE_ONLY_INSTANTIATE_FILTERS,
    },
  },
};

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  await createOrUpgradePolicies({
    authentication,
    context,
    policies: [MACHINE_ONLY_INSTANTIATE_POLICY],
    principal: { type: "actorType", actorType: "machine" },
  });

  for (const actorType of ["user", "machine", "ai"] as const) {
    await createOrUpgradePolicies({
      authentication,
      context,
      policies: [AUTHENTICATED_INSTANTIATE_POLICY],
      principal: { type: "actorType", actorType },
    });
  }

  return migrationState;
};

export default migrate;
