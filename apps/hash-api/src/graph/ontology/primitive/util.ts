import type { VersionedUrl, WebId } from "@blockprotocol/type-system";
import { getWebById } from "@local/hash-graph-sdk/principal/web";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";

import type { ImpureGraphFunction } from "../../context-types";

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
> = (ctx, authentication, params) =>
  getWebById(ctx.graphApi, authentication, params.accountOrAccountGroupId).then(
    (web) => {
      if (!web) {
        throw new Error(
          `failed to get web for id: ${params.accountOrAccountGroupId}`,
        );
      }
      if (!web.shortname) {
        throw new Error(
          `Shortname is not set for web: ${params.accountOrAccountGroupId}`,
        );
      }
      return web.shortname;
    },
  );
