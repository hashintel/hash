import { Logger } from "@local/hash-backend-utils/logger";
import { SearchAdapter } from "@local/hash-backend-utils/search/adapter";

import { CacheAdapter } from "../cache";
import { EmailTransporter } from "../email/transporters";
import { GraphApi } from "../graph";
import { User } from "../graph/knowledge/system-types/user";
import { UploadableStorageProvider } from "../storage";
import { TemporalClient } from "../temporal";

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
  user?: User;
  temporal?: TemporalClient;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
