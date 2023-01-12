import { Logger } from "@hashintel/hash-backend-utils/logger";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";

import { CacheAdapter } from "../cache";
import { EmailTransporter } from "../email/transporters";
import { GraphApi } from "../graph";
import { User } from "../graph/knowledge/system-types/user";
import { UploadableStorageProvider } from "../storage";
import { TaskExecutor } from "../task-execution";

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
    taskExecutor?: TaskExecutor;
  };
  emailTransporter: EmailTransporter;
  logger: Logger;
  user?: User;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
