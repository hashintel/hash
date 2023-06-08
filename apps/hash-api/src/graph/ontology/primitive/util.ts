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
import { systemUserAccountId } from "../../system-user";

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
> = async (ctx, params) => {
  const namespace =
    params.ownerId === systemUserAccountId
      ? systemUserShortname
      : (
          (await getUserById(ctx, {
            entityId: entityIdFromOwnedByIdAndEntityUuid(
              systemUserAccountId as OwnedById,
              params.ownerId as Uuid as EntityUuid,
            ),
          }).catch(() => undefined)) ??
          (await getOrgById(ctx, {
            entityId: entityIdFromOwnedByIdAndEntityUuid(
              systemUserAccountId as OwnedById,
              params.ownerId as Uuid as EntityUuid,
            ),
          }).catch(() => undefined))
        )?.shortname;

  if (!namespace) {
    throw new Error(`failed to get namespace for owner: ${params.ownerId}`);
  }

  return namespace;
};
