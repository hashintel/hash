import { Logger } from "@local/hash-backend-utils/logger";
import { SearchAdapter } from "@local/hash-backend-utils/search/adapter";

import { AgentRunner } from "../agents/runner";
import { CacheAdapter } from "../cache";
import { EmailTransporter } from "../email/transporters";
import { GraphApi } from "../graph";
import { User } from "../graph/knowledge/system-types/user";
import { UploadableStorageProvider } from "../storage";

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
    agentRunner?: AgentRunner;
  };
  emailTransporter: EmailTransporter;
  logger: Logger;
  user?: User;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
