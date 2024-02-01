import { BaseUrl } from "@local/hash-subgraph";

import { AuthenticationContext } from "../../../graphql/authentication-context";
import { ImpureGraphContext } from "../../context-types";

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
