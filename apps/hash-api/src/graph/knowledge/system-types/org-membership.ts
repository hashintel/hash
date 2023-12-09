import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { IsMemberOfProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountEntityId,
  AccountGroupEntityId,
  EntityId,
  extractAccountGroupId,
  extractAccountId,
  extractEntityUuidFromEntityId,
  OwnedById,
} from "@local/hash-subgraph";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import {
  createLinkEntity,
  CreateLinkEntityParams,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";
import { getOrgFromEntity, Org } from "./org";
import { getUserFromEntity, User } from "./user";

export type OrgMembership = {
  linkEntity: LinkEntity<IsMemberOfProperties>;
};

export const getOrgMembershipFromLinkEntity: PureGraphFunction<
  { linkEntity: LinkEntity },
  OrgMembership
> = ({ linkEntity }) => {
  if (
    linkEntity.metadata.entityTypeId !==
    systemLinkEntityTypes.isMemberOf.linkEntityTypeId
  ) {
    throw new EntityTypeMismatchError(
      linkEntity.metadata.recordId.entityId,
      systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
      linkEntity.metadata.entityTypeId,
    );
  }

  return {
    linkEntity,
  };
};

/**
 * Create a system OrgMembership entity.
 *
 * @param params.org - the org
 * @param params.user - the user
 *
 * @see {@link createLinkEntity} for the documentation of the remaining parameters
 */
export const createOrgMembership: ImpureGraphFunction<
  {
    orgEntityId: EntityId;
    userEntityId: EntityId;
  },
  Promise<OrgMembership>
> = async (ctx, authentication, { userEntityId, orgEntityId }) => {
  const userAccountId = extractAccountId(userEntityId as AccountEntityId);
  const orgAccountGroupId = extractAccountGroupId(
    orgEntityId as AccountGroupEntityId,
  );

  await ctx.graphApi.addAccountGroupMember(
    authentication.actorId,
    orgAccountGroupId,
    userAccountId,
  );

  let linkEntity;
  try {
    linkEntity = await createLinkEntity(ctx, authentication, {
      ownedById: orgAccountGroupId as OwnedById,
      linkEntityTypeId: systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
      leftEntityId: userEntityId,
      rightEntityId: orgEntityId,
      properties: {},
      inheritedPermissions: ["administratorFromWeb", "updateFromWeb"],
      relationships: [
        {
          relation: "editor",
          subject: {
            kind: "account",
            subjectId: userAccountId,
          },
        },
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    });
  } catch (error) {
    await ctx.graphApi.removeAccountGroupMember(
      authentication.actorId,
      extractEntityUuidFromEntityId(orgEntityId),
      extractAccountId(userEntityId as AccountEntityId),
    );

    throw error;
  }

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
> = async (ctx, authentication, { orgMembership }) => {
  const orgEntity = await getLinkEntityRightEntity(ctx, authentication, {
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
> = async (ctx, authentication, { orgMembership }) => {
  const userEntity = await getLinkEntityLeftEntity(ctx, authentication, {
    linkEntity: orgMembership.linkEntity,
  });

  return getUserFromEntity({ entity: userEntity });
};
