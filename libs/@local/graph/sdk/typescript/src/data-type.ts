import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  GraphApi,
  HasPermissionForDataTypesParams,
} from "@local/hash-graph-client";
import type { ActionName } from "@rust/hash-graph-authorization/types";

import type { AuthenticationContext } from "./authentication-context.js";

export const hasPermissionForDataTypes = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  params: Subtype<
    HasPermissionForDataTypesParams,
    {
      dataTypeIds: VersionedUrl[];
      action: Subtype<
        ActionName,
        "viewDataType" | "updateDataType" | "archiveDataType"
      >;
    }
  >,
): Promise<VersionedUrl[]> =>
  graphAPI
    .hasPermissionForDataTypes(authentication.actorId, params)
    .then(({ data: permitted }) => permitted as VersionedUrl[]);
