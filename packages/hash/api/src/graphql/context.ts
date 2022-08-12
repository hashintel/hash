import { Logger } from "@hashintel/hash-backend-utils/logger";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";

import { User } from "../model";
import { DbAdapter } from "../db";
import { CacheAdapter } from "../cache";
import { EmailTransporter } from "../email/transporters";
import { StorageType } from "./apiTypes.gen";
import { TaskExecutor } from "../task-execution";
import { GraphApi } from "../graph";

/**
 * Apollo context object with dataSources. For details see:
 * https://www.apollographql.com/docs/apollo-server/data/data-sources/
 */
export interface GraphQLContext {
  dataSources: {
    graphApi: GraphApi;
    db: DbAdapter;
    cache: CacheAdapter;
    search?: SearchAdapter;
    taskExecutor?: TaskExecutor;
  };
  emailTransporter: EmailTransporter;
  uploadProvider: StorageType;
  logger: Logger;
  user?: Omit<User, "entityType">;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
