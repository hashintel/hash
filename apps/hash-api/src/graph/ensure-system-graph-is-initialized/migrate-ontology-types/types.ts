import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { BaseUrl } from "@local/hash-graph-types/ontology";

import type { ImpureGraphContext } from "../../context-types.js";

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
