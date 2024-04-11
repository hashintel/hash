import type { UploadableStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { SearchAdapter } from "@local/hash-backend-utils/search/adapter";
import type { VaultClient } from "@local/hash-backend-utils/vault";

import type { CacheAdapter } from "../cache";
import type { EmailTransporter } from "../email/transporters";
import type { GraphApi } from "../graph/context-types";
import type { User } from "../graph/knowledge/system-types/user";
import type { TemporalClient } from "../temporal";
import type { AuthenticationContext } from "./authentication-context";

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
  temporal: TemporalClient;
  vault?: VaultClient;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
