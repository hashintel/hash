import { BaseUrl } from "@local/hash-subgraph/.";

import { AuthenticationContext } from "../../graphql/authentication-context";
import { ImpureGraphContext } from "../context-types";

export type MigrationState = {
  propertyTypeVersions: Record<BaseUrl, number>;
  entityTypeVersions: Record<BaseUrl, number>;
};

export type MigrationFunction = (params: {
  context: ImpureGraphContext;
  authentication: AuthenticationContext;
  migrationState: MigrationState;
}) => Promise<MigrationState>;
