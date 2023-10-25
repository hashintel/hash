import { systemUserShortname } from "@local/hash-isomorphic-utils/environment";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";

import { ImpureGraphFunction } from "../..";
import { getOrgById } from "../../knowledge/system-types/org";
import { getUserById } from "../../knowledge/system-types/user";
import { systemAccountId } from "../../system-accounts";

/**
 * Get the namespace of an account owner by its id
 *
 * @param params.ownerId - the id of the owner
 */
export const getNamespaceOfAccountOwner: ImpureGraphFunction<
  {
    ownerId: OwnedById;
  },
  Promise<string>
> = async (ctx, authentication, params) => {
  const namespace =
    params.ownerId === systemAccountId
      ? systemUserShortname
      : (
          (await getUserById(ctx, authentication, {
            entityId: entityIdFromOwnedByIdAndEntityUuid(
              params.ownerId as Uuid as OwnedById,
              params.ownerId as Uuid as EntityUuid,
            ),
          }).catch(() => undefined)) ??
          (await getOrgById(ctx, authentication, {
            entityId: entityIdFromOwnedByIdAndEntityUuid(
              params.ownerId as Uuid as OwnedById,
              params.ownerId as Uuid as EntityUuid,
            ),
          }).catch(() => undefined))
        )?.shortname;

  if (!namespace) {
    throw new Error(`failed to get namespace for owner: ${params.ownerId}`);
  }

  return namespace;
};
