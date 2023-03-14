import {
  EntityPropertiesObject,
  extractEntityUuidFromEntityId,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import {
  createLinkEntity,
  CreateLinkEntityParams,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
  LinkEntity,
} from "../primitive/link-entity";
import { getOrgFromEntity, Org } from "./org";
import { getUserFromEntity, User } from "./user";

export type OrgMembership = {
  responsibility: string;
  linkEntity: LinkEntity;
};

export const getOrgMembershipFromLinkEntity: PureGraphFunction<
  { linkEntity: LinkEntity },
  OrgMembership
> = ({ linkEntity }) => {
  if (
    linkEntity.metadata.entityTypeId !==
    SYSTEM_TYPES.linkEntityType.orgMembership.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      linkEntity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.user.schema.$id,
      linkEntity.metadata.entityTypeId,
    );
  }

  const responsibility = linkEntity.properties[
    SYSTEM_TYPES.propertyType.responsibility.metadata.recordId.baseUrl
  ] as string;

  return {
    responsibility,
    linkEntity,
  };
};

/**
 * Create a system OrgMembership entity.
 *
 * @param params.responsibility - the role of the user at the organization
 * @param params.org - the org
 * @param params.user - the user
 *
 * @see {@link createLinkEntity} for the documentation of the remaining parameters
 */
export const createOrgMembership: ImpureGraphFunction<
  Omit<
    CreateLinkEntityParams,
    | "properties"
    | "linkEntityType"
    | "leftEntityId"
    | "rightEntityId"
    | "ownedById"
  > & {
    responsibility: string;
    org: Org;
    user: User;
  },
  Promise<OrgMembership>
> = async (ctx, { user, org, responsibility, actorId }) => {
  const properties: EntityPropertiesObject = {
    [SYSTEM_TYPES.propertyType.responsibility.metadata.recordId.baseUrl]:
      responsibility,
  };

  const linkEntity = await createLinkEntity(ctx, {
    ownedById: extractEntityUuidFromEntityId(
      org.entity.metadata.recordId.entityId,
    ) as Uuid as OwnedById,
    linkEntityType: SYSTEM_TYPES.linkEntityType.orgMembership,
    leftEntityId: user.entity.metadata.recordId.entityId,
    rightEntityId: org.entity.metadata.recordId.entityId,
    properties,
    actorId,
  });

  return getOrgMembershipFromLinkEntity({ linkEntity });
};

/**
 * Get the org linked to the org membership.
 *
 * @param orgMembership - the org membership
 */
export const getOrgMembershipOrg: ImpureGraphFunction<
  { orgMembership: OrgMembership },
  Promise<Org>
> = async (ctx, { orgMembership }) => {
  const orgEntity = await getLinkEntityRightEntity(ctx, {
    linkEntity: orgMembership.linkEntity,
  });

  return getOrgFromEntity({ entity: orgEntity });
};

/**
 * Get the user linked to the org membership.
 *
 * @param params.orgMembership - the org membership
 */
export const getOrgMembershipUser: ImpureGraphFunction<
  { orgMembership: OrgMembership },
  Promise<User>
> = async (ctx, { orgMembership }) => {
  const userEntity = await getLinkEntityLeftEntity(ctx, {
    linkEntity: orgMembership.linkEntity,
  });

  return getUserFromEntity({ entity: userEntity });
};
