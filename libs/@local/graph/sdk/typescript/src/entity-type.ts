import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  GraphApi,
  HasPermissionForEntityTypesParams,
} from "@local/hash-graph-client";
import type { ActionName } from "@rust/hash-graph-authorization/types";

import type { AuthenticationContext } from "./authentication-context.js";

export const hasPermissionForEntityTypes = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  params: Subtype<
    HasPermissionForEntityTypesParams,
    {
      entityTypeIds: VersionedUrl[];
      action: Subtype<
        ActionName,
        | "viewEntityType"
        | "updateEntityType"
        | "archiveEntityType"
        | "instantiate"
      >;
    }
  >,
): Promise<VersionedUrl[]> =>
  graphAPI
    .hasPermissionForEntityTypes(authentication.actorId, params)
    .then(({ data: permitted }) => permitted as VersionedUrl[]);
