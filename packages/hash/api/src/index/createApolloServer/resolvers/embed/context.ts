import { Logger } from "@hashintel/hash-backend-utils/logger";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";

import { UserModel } from "../../../auth/model";
import { CacheAdapter } from "../../../cache";
import { EmailTransporter } from "../../../transporters";
import { StorageType } from "../../../auth/model/aggregation.model/apiTypes.gen";
import { TaskExecutor } from "./context/task-execution";
import { GraphApi } from "../../../auth/model/entity.model/entity-type/graph";

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
  userModel?: UserModel;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  userModel: UserModel;
}
