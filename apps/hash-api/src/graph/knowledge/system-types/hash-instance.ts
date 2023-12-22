import { NotFoundError } from "@local/hash-backend-utils/error";
import {
  getHashInstance,
  getHashInstanceFromEntity,
  HashInstance,
} from "@local/hash-backend-utils/hash-instance";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { HASHInstanceProperties } from "@local/hash-isomorphic-utils/system-types/hashinstance";
import { AccountGroupId, OwnedById } from "@local/hash-subgraph";

import { createAccountGroup } from "../../account-permission-management";
import { ImpureGraphFunction } from "../../context-types";
import { modifyEntityTypeAuthorizationRelationships } from "../../ontology/primitive/entity-type";
import { createEntity } from "../primitive/entity";
import { getOrgByShortname } from "./org";
import { User } from "./user";

/**
 * Create the hash instance entity.
 *
 * @param params.pagesAreEnabled - whether or not pages are enabled
 * @param params.userSelfRegistrationIsEnabled - whether or not user self registration is enabled
 * @param params.userRegistrationByInviteIsEnabled - whether or not user registration by invitation is enabled
 * @param params.orgSelfRegistrationIsEnabled - whether or not org registration is enabled
 */
export const createHashInstance: ImpureGraphFunction<
  {
    pagesAreEnabled?: boolean;
    userSelfRegistrationIsEnabled?: boolean;
    userRegistrationByInviteIsEnabled?: boolean;
    orgSelfRegistrationIsEnabled?: boolean;
  },
  Promise<HashInstance>
> = async (ctx, authentication, params) => {
  // Ensure the hash instance entity has not already been created.
  const existingHashInstance = await getHashInstance(ctx, authentication).catch(
    (error: Error) => {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    },
  );

  if (existingHashInstance) {
    throw new Error("HASH instance entity already exists.");
  }

  const hashInstanceAdminsAccountGroupId = await createAccountGroup(
    ctx,
    authentication,
    {},
  );

  const hashOrg = await getOrgByShortname(ctx, authentication, {
    shortname: "hash",
  });

  if (!hashOrg) {
    throw new Error(
      "Cannot create HASH Instance entity before HASH Org is created",
    );
  }

  const entity = await createEntity(ctx, authentication, {
    ownedById: hashOrg.accountGroupId as OwnedById,
    properties: {
      "https://hash.ai/@hash/types/property-type/pages-are-enabled/":
        params.pagesAreEnabled ?? true,
      "https://hash.ai/@hash/types/property-type/user-self-registration-is-enabled/":
        params.userSelfRegistrationIsEnabled ?? true,
      "https://hash.ai/@hash/types/property-type/user-registration-by-invitation-is-enabled/":
        params.userRegistrationByInviteIsEnabled ?? true,
      "https://hash.ai/@hash/types/property-type/org-self-registration-is-enabled/":
        params.orgSelfRegistrationIsEnabled ?? true,
    } as HASHInstanceProperties,
    entityTypeId: systemEntityTypes.hashInstance.entityTypeId,
    relationships: [
      {
        relation: "viewer",
        subject: { kind: "public" },
      },
      {
        relation: "administrator",
        subject: {
          kind: "accountGroup",
          subjectId: hashInstanceAdminsAccountGroupId,
        },
      },
    ],
  });

  await modifyEntityTypeAuthorizationRelationships(ctx, authentication, [
    {
      operation: "touch",
      relationship: {
        relation: "instantiator",
        subject: {
          kind: "accountGroup",
          subjectId: hashInstanceAdminsAccountGroupId,
        },
        resource: {
          kind: "entityType",
          resourceId: systemEntityTypes.hashInstance.entityTypeId,
        },
      },
    },
  ]);

  return getHashInstanceFromEntity({ entity });
};

/**
 * Add an instance admin to the hash instance.
 *
 * @param params.user - the user to be added as a hash instance admin.
 *
 * @see {@link createEntity} for the documentation of the remaining parameters
 */
export const addHashInstanceAdmin: ImpureGraphFunction<
  { user: User },
  Promise<void>
> = async (ctx, authentication, params) => {
  const hashInstance = await getHashInstance(ctx, authentication);

  const entityPermissions = await ctx.graphApi
    .getEntityAuthorizationRelationships(
      authentication.actorId,
      hashInstance.entity.metadata.recordId.entityId,
    )
    .then((resp) => resp.data);

  const entityAdmin = entityPermissions.find(
    (permission) => permission.relation === "administrator",
  )?.subject;

  if (!entityAdmin || !("subjectId" in entityAdmin)) {
    throw new Error("No administrator role over HASH Instance entity.");
  }

  await ctx.graphApi.addAccountGroupMember(
    authentication.actorId,
    entityAdmin.subjectId,
    params.user.accountId,
  );
};

/**
 * Remove an instance admin from the hash instance.
 *
 * @param params.user - the user to be removed as a hash instance admin.
 */
export const removeHashInstanceAdmin: ImpureGraphFunction<
  { user: User },
  Promise<void>
> = async (ctx, authentication, params): Promise<void> => {
  const hashInstance = await getHashInstance(ctx, authentication);

  const entityPermissions = await ctx.graphApi
    .getEntityAuthorizationRelationships(
      authentication.actorId,
      hashInstance.entity.metadata.recordId.entityId,
    )
    .then((resp) => resp.data);

  const entityAdmin = entityPermissions.find(
    (permission) => permission.relation === "administrator",
  )?.subject;

  if (!entityAdmin || !("subjectId" in entityAdmin)) {
    throw new Error("No administrator role over HASH Instance entity.");
  }

  await ctx.graphApi.removeAccountGroupMember(
    authentication.actorId,
    entityAdmin.subjectId,
    params.user.accountId,
  );
};
