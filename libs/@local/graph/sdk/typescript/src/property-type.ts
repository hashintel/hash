import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  GraphApi,
  HasPermissionForPropertyTypesParams,
} from "@local/hash-graph-client";
import type { ActionName } from "@rust/hash-graph-authorization/types";

import type { AuthenticationContext } from "./authentication-context.js";

export const hasPermissionForPropertyTypes = <
  T extends [VersionedUrl, ...VersionedUrl[]],
>(
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  params: Subtype<
    HasPermissionForPropertyTypesParams,
    {
      propertyTypeIds: T;
      action: Subtype<
        ActionName,
        "viewPropertyType" | "updatePropertyType" | "archivePropertyType"
      >;
    }
  >,
): Promise<{ [K in keyof T]: VersionedUrl }> =>
  graphAPI
    .hasPermissionForPropertyTypes(authentication.actorId, params)
    .then(
      ({ data: permitted }) => permitted as { [K in keyof T]: VersionedUrl },
    );
