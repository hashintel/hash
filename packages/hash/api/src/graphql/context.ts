import { Logger } from "@hashintel/hash-backend-utils/logger";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";

import { CacheAdapter } from "../cache";
import { EmailTransporter } from "../email/transporters";
import { StorageType } from "./api-types.gen";
import { TaskExecutor } from "../task-execution";
import { GraphApi } from "../graph";
import { User } from "../graph/knowledge/system-types/user";

/**
 * Apollo context object with dataSources. For details see:
 * https://www.apollographql.com/docs/apollo-server/data/data-sources/
 */
export interface GraphQLContext {
  dataSources: {
    graphApi: GraphApi;
    cache: CacheAdapter;
    search?: SearchAdapter;
    taskExecutor?: TaskExecutor;
  };
  emailTransporter: EmailTransporter;
  uploadProvider: StorageType;
  logger: Logger;
  user?: User;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
