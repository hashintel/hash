import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";

import { getOrgById } from "../../knowledge/system-types/org";
import { getUserById } from "../../knowledge/system-types/user";
import { ImpureGraphFunction } from "../../util";

/**
 * Get the web shortname of an account or account group by its id
 */
export const getWebShortname: ImpureGraphFunction<
  {
    accountOrAccountGroupId: OwnedById;
  },
  Promise<string>
> = async (ctx, authentication, params) => {
  const namespace = (
    (await getUserById(ctx, authentication, {
      entityId: entityIdFromOwnedByIdAndEntityUuid(
        params.accountOrAccountGroupId as Uuid as OwnedById,
        params.accountOrAccountGroupId as Uuid as EntityUuid,
      ),
    }).catch(() => undefined)) ??
    (await getOrgById(ctx, authentication, {
      entityId: entityIdFromOwnedByIdAndEntityUuid(
        params.accountOrAccountGroupId as Uuid as OwnedById,
        params.accountOrAccountGroupId as Uuid as EntityUuid,
      ),
    }).catch(() => undefined))
  )?.shortname;

  if (!namespace) {
    throw new Error(
      `failed to get namespace for owner: ${params.accountOrAccountGroupId}`,
    );
  }

  return namespace;
};
