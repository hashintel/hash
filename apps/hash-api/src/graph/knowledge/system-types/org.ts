import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { OrgProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountGroupEntityId,
  AccountGroupId,
  Entity,
  EntityId,
  EntityPropertiesObject,
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
  CreateEntityParams,
  getLatestEntityById,
  modifyEntityAuthorizationRelationships,
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
    entity.metadata.entityTypeId !==
    systemTypes.entityType.organization.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemTypes.entityType.organization.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const { organizationName: orgName, shortname } = simplifyProperties(
    entity.properties as OrgProperties,
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
  Omit<CreateEntityParams, "properties" | "entityTypeId" | "ownedById"> & {
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
  }

  const properties: EntityPropertiesObject = {
    [extractBaseUrl(systemTypes.propertyType.shortname.propertyTypeId)]:
      shortname,
    [extractBaseUrl(systemTypes.propertyType.organizationName.propertyTypeId)]:
      name,
    ...(websiteUrl
      ? {
          [extractBaseUrl(systemTypes.propertyType.websiteUrl.propertyTypeId)]:
            websiteUrl,
        }
      : {}),
  };

  const entity = await createEntity(ctx, authentication, {
    ownedById: orgAccountGroupId as OwnedById,
    properties,
    entityTypeId: systemTypes.entityType.organization.entityTypeId,
    entityUuid: orgAccountGroupId as string as EntityUuid,
  });
  await modifyEntityAuthorizationRelationships(ctx, authentication, [
    {
      operation: "create",
      relationship: {
        subject: {
          kind: "public",
        },
        relation: "viewer",
        resource: {
          kind: "entity",
          resourceId: entity.metadata.recordId.entityId,
        },
      },
    },
  ]);

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
  { shortname: string },
  Promise<Org | null>
> = async ({ graphApi }, { actorId }, params) => {
  const [orgEntity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemTypes.entityType.organization.entityTypeId,
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(
                    systemTypes.propertyType.shortname.propertyTypeId,
                  ),
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
      systemTypes.propertyType.shortname.propertyTypeId,
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
      systemTypes.propertyType.organizationName.propertyTypeId,
    ),
    value: updatedOrgName,
  });

  return getOrgFromEntity({ entity: updatedEntity });
};
