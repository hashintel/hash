import type { BaseUrl } from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

import type { ImpureGraphContext } from "../../context-types";

export type MigrationState = {
  propertyTypeVersions: Record<BaseUrl, number>;
  entityTypeVersions: Record<BaseUrl, number>;
  dataTypeVersions: Record<BaseUrl, number>;
};

export type MigrationFunction = (params: {
  context: ImpureGraphContext<false, true>;
  authentication: AuthenticationContext;
  migrationState: MigrationState;
}) => Promise<MigrationState>;
