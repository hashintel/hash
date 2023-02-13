import {
  AccountId,
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRootType,
  EntityUuid,
  extractEntityUuidFromEntityId,
  OwnedById,
  Subgraph,
  Uuid,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { mapSubgraph } from "@local/hash-subgraph/temp";

import { EntityTypeMismatchError } from "../../../lib/error";
import {
  ImpureGraphFunction,
  PureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import { systemUserAccountId } from "../../system-user";
import {
  createEntity,
  CreateEntityParams,
  getLatestEntityById,
  updateEntityProperty,
} from "../primitive/entity";
import {
  shortnameIsInvalid,
  shortnameIsRestricted,
  shortnameIsTaken,
} from "./account.fields";

/**
 * @todo revisit organization size provided info. These constant strings could
 *   be replaced by ranges for example.
 *   https://app.asana.com/0/0/1202900021005257/f
 */
export enum OrgSize {
  ElevenToFifty = "ELEVEN_TO_FIFTY",
  FiftyOneToTwoHundredAndFifty = "FIFTY_ONE_TO_TWO_HUNDRED_AND_FIFTY",
  OneToTen = "ONE_TO_TEN",
  TwoHundredAndFiftyPlus = "TWO_HUNDRED_AND_FIFTY_PLUS",
}

export type OrgProvidedInfo = {
  orgSize: OrgSize;
};

export type Org = {
  accountId: AccountId;
  orgName: string;
  shortname: string;
  entity: Entity;
};

export const getOrgFromEntity: PureGraphFunction<{ entity: Entity }, Org> = ({
  entity,
}) => {
  if (entity.metadata.entityTypeId !== SYSTEM_TYPES.entityType.org.schema.$id) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.user.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const orgName = entity.properties[
    SYSTEM_TYPES.propertyType.orgName.metadata.recordId.baseUri
  ] as string;

  const shortname = entity.properties[
    SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri
  ] as string;

  return {
    accountId: extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    ) as Uuid as AccountId,
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
 * @param params.orgAccountId - the account Id of the org
 *
 * @see {@link createEntity} for the documentation of the remaining parameters
 */
export const createOrg: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId" | "ownedById"> & {
    shortname: string;
    name: string;
    providedInfo?: OrgProvidedInfo;
    orgAccountId?: AccountId;
  },
  Promise<Org>
> = async (ctx, params) => {
  const { shortname, name, providedInfo, actorId } = params;

  if (shortnameIsInvalid({ shortname })) {
    throw new Error(`The shortname "${shortname}" is invalid`);
  }

  if (
    shortnameIsRestricted({ shortname }) ||
    (await shortnameIsTaken(ctx, { shortname }))
  ) {
    throw new Error(`An account with shortname "${shortname}" already exists.`);
  }

  const { graphApi } = ctx;

  const orgAccountId =
    params.orgAccountId ?? (await graphApi.createAccountId()).data;

  const properties: EntityPropertiesObject = {
    [SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri]: shortname,
    [SYSTEM_TYPES.propertyType.orgName.metadata.recordId.baseUri]: name,
    ...(providedInfo
      ? {
          [SYSTEM_TYPES.propertyType.orgProvidedInfo.metadata.recordId.baseUri]:
            {
              [SYSTEM_TYPES.propertyType.orgSize.metadata.recordId.baseUri]:
                providedInfo.orgSize,
            },
        }
      : {}),
  };

  const entity = await createEntity(ctx, {
    ownedById: systemUserAccountId as OwnedById,
    properties,
    entityTypeId: SYSTEM_TYPES.entityType.org.schema.$id,
    entityUuid: orgAccountId as EntityUuid,
    actorId,
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
> = async (ctx, { entityId }) => {
  const entity = await getLatestEntityById(ctx, {
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
> = async ({ graphApi }, params) => {
  const [orgEntity, ...unexpectedEntities] = await graphApi
    .getEntitiesByQuery({
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "versionedUri"] },
              { parameter: SYSTEM_TYPES.entityType.org.schema.$id },
            ],
          },
          {
            equal: [
              {
                path: [
                  "properties",
                  SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri,
                ],
              },
              { parameter: params.shortname },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      timeProjection: {
        kernel: {
          axis: "transaction",
          timestamp: null,
        },
        image: {
          axis: "decision",
          start: null,
          end: null,
        },
      },
    })
    .then(({ data: userEntitiesSubgraph }) =>
      getRoots(mapSubgraph(userEntitiesSubgraph) as Subgraph<EntityRootType>),
    );

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: More than one org entity with shortname ${params.shortname} found in the graph.`,
    );
  }

  return orgEntity ? getOrgFromEntity({ entity: orgEntity }) : null;
};

/**
 * Update the shortname of a User.
 *
 * @param params.org - the org
 * @param params.updatedShortname - the new shortname to assign to the User
 * @param params.actorId - the id of the account that is updating the shortname
 */
export const updateOrgShortname: ImpureGraphFunction<
  { org: Org; updatedShortname: string; actorId: AccountId },
  Promise<Org>
> = async (ctx, params) => {
  const { org, updatedShortname, actorId } = params;

  if (shortnameIsInvalid({ shortname: updatedShortname })) {
    throw new Error(`The shortname "${updatedShortname}" is invalid`);
  }

  if (
    shortnameIsRestricted({ shortname: updatedShortname }) ||
    (await shortnameIsTaken(ctx, { shortname: updatedShortname }))
  ) {
    throw new Error(
      `An account with shortname "${updatedShortname}" already exists.`,
    );
  }

  const updatedOrg = await updateEntityProperty(ctx, {
    entity: org.entity,
    propertyTypeBaseUri:
      SYSTEM_TYPES.propertyType.shortName.metadata.recordId.baseUri,
    value: updatedShortname,
    actorId,
  }).then((updatedEntity) => getOrgFromEntity({ entity: updatedEntity }));

  return updatedOrg;
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
  { org: Org; updatedOrgName: string; actorId: AccountId },
  Promise<Org>
> = async (ctx, params) => {
  const { org, updatedOrgName, actorId } = params;

  if (orgNameIsInvalid({ orgName: updatedOrgName })) {
    throw new Error(`Organization name "${updatedOrgName}" is invalid.`);
  }

  const updatedEntity = await updateEntityProperty(ctx, {
    entity: org.entity,
    propertyTypeBaseUri:
      SYSTEM_TYPES.propertyType.orgName.metadata.recordId.baseUri,
    value: updatedOrgName,
    actorId,
  });

  return getOrgFromEntity({ entity: updatedEntity });
};
