import type { BaseUrl, OntologyTypeVersion } from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

import type { ImpureGraphContext } from "../../context-types";

export type MigrationState = {
  propertyTypeVersions: Record<BaseUrl, OntologyTypeVersion>;
  entityTypeVersions: Record<BaseUrl, OntologyTypeVersion>;
  dataTypeVersions: Record<BaseUrl, OntologyTypeVersion>;
};

export type MigrationFunction = (params: {
  context: ImpureGraphContext<false, true>;
  authentication: AuthenticationContext;
  migrationState: MigrationState;
}) => Promise<MigrationState>;
