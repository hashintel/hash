import { createWebMachineActor } from "@local/hash-backend-utils/machine-actors";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { OrganizationProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountGroupEntityId,
  AccountGroupId,
  Entity,
  EntityId,
  EntityRootType,
  EntityUuid,
  extractAccountGroupId,
  OwnedById,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { EntityTypeMismatchError } from "../../../lib/error";
import {
  createAccountGroup,
  createWeb,
} from "../../account-permission-management";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import {
  createEntity,
  getLatestEntityById,
  updateEntityProperty,
} from "../primitive/entity";
import {
  shortnameIsInvalid,
  shortnameIsRestricted,
  shortnameIsTaken,
} from "./account.fields";

export type Org = {
  accountGroupId: AccountGroupId;
  orgName: string;
  shortname: string;
  entity: Entity;
};

export const getOrgFromEntity: PureGraphFunction<{ entity: Entity }, Org> = ({
  entity,
}) => {
  if (
    entity.metadata.entityTypeId !== systemEntityTypes.organization.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.organization.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const { organizationName: orgName, shortname } = simplifyProperties(
    entity.properties as OrganizationProperties,
  );

  return {
    accountGroupId: extractAccountGroupId(
      entity.metadata.recordId.entityId as AccountGroupEntityId,
    ),
    shortname,
    orgName,
    entity,
  };
};

/**
 * Create a system organization entity.
 *
 * @param params.shortname - the shortname of the organization
 * @param params.name - the name of the organization
 * @param params.providedInfo - optional metadata about the organization
 * @param params.websiteUrl - the website of the organization
 *
 * @see {@link createEntity} for the documentation of the remaining parameters
 */
export const createOrg: ImpureGraphFunction<
  {
    shortname: string;
    name: string;
    orgAccountGroupId?: AccountGroupId;
    websiteUrl?: string | null;
  },
  Promise<Org>
> = async (ctx, authentication, params) => {
  const { shortname, name, websiteUrl } = params;

  if (shortnameIsInvalid({ shortname })) {
    throw new Error(`The shortname "${shortname}" is invalid`);
  }

  if (
    shortnameIsRestricted({ shortname }) ||
    (await shortnameIsTaken(ctx, authentication, { shortname }))
  ) {
    throw new Error(
      `An account or an account group with shortname "${shortname}" already exists.`,
    );
  }

  let orgAccountGroupId: AccountGroupId;
  if (params.orgAccountGroupId) {
    orgAccountGroupId = params.orgAccountGroupId;
  } else {
    orgAccountGroupId = await createAccountGroup(ctx, authentication, {});
    await createWeb(ctx, authentication, {
      ownedById: orgAccountGroupId as OwnedById,
      owner: { kind: "accountGroup", subjectId: orgAccountGroupId },
    });

    await createWebMachineActor(ctx, authentication, {
      ownedById: orgAccountGroupId as OwnedById,
    });
  }

  const properties: OrganizationProperties = {
    "https://hash.ai/@hash/types/property-type/shortname/": shortname,
    "https://hash.ai/@hash/types/property-type/organization-name/": name,
    ...(websiteUrl
      ? {
          "https://hash.ai/@hash/types/property-type/website-url/": websiteUrl,
        }
      : {}),
  };

  const entity = await createEntity(ctx, authentication, {
    ownedById: orgAccountGroupId as OwnedById,
    properties,
    entityTypeId: systemEntityTypes.organization.entityTypeId,
    entityUuid: orgAccountGroupId as string as EntityUuid,
    relationships: [
      {
        relation: "viewer",
        subject: {
          kind: "public",
        },
      },
      {
        relation: "setting",
        subject: {
          kind: "setting",
          subjectId: "administratorFromWeb",
        },
      },
    ],
  });

  return getOrgFromEntity({ entity });
};

/**
 * Get a system organization entity by its entity id.
 *
 * @param params.entityId - the entity id of the organization
 */
export const getOrgById: ImpureGraphFunction<
  { entityId: EntityId },
  Promise<Org>
> = async (ctx, authentication, { entityId }) => {
  const entity = await getLatestEntityById(ctx, authentication, {
    entityId,
  });

  return getOrgFromEntity({ entity });
};

/**
 * Get a system organization entity by its shortname.
 *
 * @param params.shortname - the shortname of the organization
 */
export const getOrgByShortname: ImpureGraphFunction<
  { shortname: string; includeDrafts?: boolean },
  Promise<Org | null>
> = async ({ graphApi }, { actorId }, params) => {
  const [orgEntity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.organization.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(systemPropertyTypes.shortname.propertyTypeId),
                ],
              },
              { parameter: params.shortname },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      // TODO: Should this be an all-time query? What happens if the org is
      //       archived/deleted, do we want to allow orgs to replace their
      //       shortname?
      //   see https://linear.app/hash/issue/H-757
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: params.includeDrafts ?? false,
    })
    .then(({ data }) => {
      const userEntitiesSubgraph =
        mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getRoots(userEntitiesSubgraph);
    });

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: More than one org entity with shortname ${params.shortname} found in the graph.`,
    );
  }

  return orgEntity ? getOrgFromEntity({ entity: orgEntity }) : null;
};

/**
 * Update the shortname of an Org.
 *
 * @param params.org - the org
 * @param params.updatedShortname - the new shortname to assign to the Org
 * @param params.actorId - the id of the account that is updating the shortname
 */
export const updateOrgShortname: ImpureGraphFunction<
  { org: Org; updatedShortname: string },
  Promise<Org>
> = async (ctx, authentication, params) => {
  const { org, updatedShortname } = params;

  if (shortnameIsInvalid({ shortname: updatedShortname })) {
    throw new Error(`The shortname "${updatedShortname}" is invalid`);
  }

  if (
    shortnameIsRestricted({ shortname: updatedShortname }) ||
    (await shortnameIsTaken(ctx, authentication, {
      shortname: updatedShortname,
    }))
  ) {
    throw new Error(
      `An account with shortname "${updatedShortname}" already exists.`,
    );
  }

  return updateEntityProperty(ctx, authentication, {
    entity: org.entity,
    propertyTypeBaseUrl: extractBaseUrl(
      systemPropertyTypes.shortname.propertyTypeId,
    ),
    value: updatedShortname,
  }).then((updatedEntity) => getOrgFromEntity({ entity: updatedEntity }));
};

/**
 * Whether an org name is invalid
 *
 * @param params.orgName - the org name
 */
export const orgNameIsInvalid: PureGraphFunction<
  { orgName: string },
  boolean
> = ({ orgName }) => {
  return orgName === "";
};

/**
 * Update the name of an Organization
 *
 * @param params.org - the org
 * @param params.updatedOrgName - the new name to assign to the Organization
 * @param params.actorId - the id of the account updating the name
 */
export const updateOrgName: ImpureGraphFunction<
  { org: Org; updatedOrgName: string },
  Promise<Org>
> = async (ctx, authentication, params) => {
  const { org, updatedOrgName } = params;

  if (orgNameIsInvalid({ orgName: updatedOrgName })) {
    throw new Error(`Organization name "${updatedOrgName}" is invalid.`);
  }

  const updatedEntity = await updateEntityProperty(ctx, authentication, {
    entity: org.entity,
    propertyTypeBaseUrl: extractBaseUrl(
      systemPropertyTypes.organizationName.propertyTypeId,
    ),
    value: updatedOrgName,
  });

  return getOrgFromEntity({ entity: updatedEntity });
};
