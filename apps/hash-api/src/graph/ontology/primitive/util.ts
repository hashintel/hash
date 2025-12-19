import type { VersionedUrl, WebId } from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";

import type { ImpureGraphFunction } from "../../context-types";
import { getOrgById } from "../../knowledge/system-types/org";
import { getUserById } from "../../knowledge/system-types/user";

export const isExternalTypeId = (typeId: VersionedUrl) =>
  !typeId.startsWith(frontendUrl) &&
  !(!isSelfHostedInstance && new URL(typeId).hostname === "hash.ai");

/**
 * Get the web shortname of an account or account group by its id
 */
export const getWebShortname: ImpureGraphFunction<
  {
    accountOrAccountGroupId: WebId;
  },
  Promise<string>
> = async (ctx, authentication, params) => {
  const namespace = (
    (await getUserById(ctx, authentication, {
      entityId: entityIdFromComponents(
        params.accountOrAccountGroupId,
        params.accountOrAccountGroupId,
      ),
    }).catch(() => undefined)) ??
    (await getOrgById(ctx, authentication, {
      entityId: entityIdFromComponents(
        params.accountOrAccountGroupId,
        params.accountOrAccountGroupId,
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
