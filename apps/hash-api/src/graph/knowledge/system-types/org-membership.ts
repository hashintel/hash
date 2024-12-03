import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type { LinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { createOrgMembershipAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { IsMemberOf } from "@local/hash-isomorphic-utils/system-types/shared";
import type {
  AccountEntityId,
  AccountGroupEntityId,
} from "@local/hash-subgraph";
import {
  extractAccountGroupId,
  extractAccountId,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import {
  createLinkEntity,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";
import type { Org } from "./org";
import { getOrgFromEntity } from "./org";
import type { User } from "./user";
import { getUserFromEntity } from "./user";

export type OrgMembership = {
  linkEntity: LinkEntity<IsMemberOf>;
};

export const getOrgMembershipFromLinkEntity: PureGraphFunction<
  { linkEntity: LinkEntity },
  OrgMembership
> = ({ linkEntity }) => {
  if (
    !linkEntity.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
    )
  ) {
    throw new EntityTypeMismatchError(
      linkEntity.metadata.recordId.entityId,
      systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
      linkEntity.metadata.entityTypeIds,
    );
  }

  return {
    linkEntity: linkEntity as LinkEntity<IsMemberOf>,
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
    linkEntity = await createLinkEntity<IsMemberOf>(ctx, authentication, {
      ownedById: orgAccountGroupId as OwnedById,
      properties: { value: {} },
      linkData: {
        leftEntityId: userEntityId,
        rightEntityId: orgEntityId,
      },
      entityTypeIds: [systemLinkEntityTypes.isMemberOf.linkEntityTypeId],
      relationships: createOrgMembershipAuthorizationRelationships({
        memberAccountId: userAccountId,
      }),
    });
  } catch (error) {
    await ctx.graphApi.removeAccountGroupMember(
      authentication.actorId,
      extractEntityUuidFromEntityId(orgEntityId),
      extractAccountId(userEntityId as AccountEntityId),
    );

    throw error;
  }

  return { linkEntity };
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
