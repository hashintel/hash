import type { UploadableStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { SearchAdapter } from "@local/hash-backend-utils/search/adapter";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";

import type { CacheAdapter } from "../cache";
import type { EmailTransporter } from "../email/transporters";
import type { GraphApi } from "../graph/context-types";
import type { User } from "../graph/knowledge/system-types/user";

/**
 * Apollo context object with dataSources. For details see:
 * https://www.apollographql.com/docs/apollo-server/data/data-sources/
 */
export interface GraphQLContext {
  dataSources: {
    graphApi: GraphApi;
    cache: CacheAdapter;
    uploadProvider: UploadableStorageProvider;
    search?: SearchAdapter;
  };
  emailTransporter: EmailTransporter;
  logger: Logger;
  authentication: AuthenticationContext;
  user?: User;
  provenance: EnforcedEntityEditionProvenance;
  temporal: TemporalClient;
  vault?: VaultClient;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
