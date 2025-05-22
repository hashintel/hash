import {
  type BaseUrl,
  compareOntologyTypeVersions,
  extractVersion,
  makeOntologyTypeVersion,
  type VersionedUrl,
} from "@blockprotocol/type-system";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  EntityResourceFilter,
  EntityTypeResourceFilter,
} from "@rust/hash-graph-authorization/types";

import type { MigrationFunction } from "../types";
import {
  createOrUpgradePolicies,
  type NamedPartialPolicy,
} from "../util/upgrade-policies";

// TODO: Allow entity filter for only the BaseURL
const createVersionedFilters = (
  baseUrl: BaseUrl,
  currentTypeId: VersionedUrl,
): EntityResourceFilter[] => {
  const versionMatch = currentTypeId.match(/\/v\/(\d+)$/);
  if (baseUrl && versionMatch && versionMatch[1]) {
    const currentVersion = extractVersion(currentTypeId);
    const filters: EntityResourceFilter[] = [];
    for (
      let i = 1;
      compareOntologyTypeVersions(
        makeOntologyTypeVersion({ major: i }),
        currentVersion,
      ) <= 0;
      i++
    ) {
      filters.push({
        type: "isOfType",
        entityType: `${baseUrl}v/${i}`,
      });
    }

    return filters;
  }
  // Fallback to just the current type ID if parsing fails or format is unexpected
  return [{ type: "isOfType", entityType: currentTypeId }];
};

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

const PUBLIC_VIEW_ENTITY_POLICY: NamedPartialPolicy = {
  name: "public-view-entity",
  effect: "permit",
  actions: ["viewEntity"],
  resource: {
    type: "entity",
    filter: {
      type: "any",
      filters: [
        ...createVersionedFilters(
          systemEntityTypes.hashInstance.entityTypeBaseUrl,
          systemEntityTypes.hashInstance.entityTypeId,
        ),
        ...createVersionedFilters(
          systemEntityTypes.actor.entityTypeBaseUrl,
          systemEntityTypes.actor.entityTypeId,
        ),
        ...createVersionedFilters(
          systemEntityTypes.user.entityTypeBaseUrl,
          systemEntityTypes.user.entityTypeId,
        ),
      ],
    },
  },
};

const AUTHENTICATED_VIEW_ENTITY_POLICY: NamedPartialPolicy = {
  name: "authenticated-view-entity",
  effect: "permit",
  actions: ["viewEntity"],
  resource: {
    type: "entity",
    filter: {
      type: "any",
      filters: [
        ...createVersionedFilters(
          systemEntityTypes.organization.entityTypeBaseUrl,
          systemEntityTypes.organization.entityTypeId,
        ),
        ...createVersionedFilters(
          systemEntityTypes.machine.entityTypeBaseUrl,
          systemEntityTypes.machine.entityTypeId,
        ),
        ...createVersionedFilters(
          systemEntityTypes.serviceFeature.entityTypeBaseUrl,
          systemEntityTypes.serviceFeature.entityTypeId,
        ),
        ...createVersionedFilters(
          systemLinkEntityTypes.isMemberOf.linkEntityTypeBaseUrl,
          systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
        ),
      ],
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
    policies: [PUBLIC_VIEW_ENTITY_POLICY],
    principal: null,
  });

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
      policies: [
        AUTHENTICATED_INSTANTIATE_POLICY,
        AUTHENTICATED_VIEW_ENTITY_POLICY,
      ],
      principal: { type: "actorType", actorType },
    });
  }

  return migrationState;
};

export default migrate;
