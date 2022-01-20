import { Logger } from "@hashintel/hash-backend-utils/logger";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";

import { PassportGraphQLMethods } from "../auth/passport";
import { User } from "../model";
import { DBAdapter } from "../db";
import { CacheAdapter } from "../cache";
import { EmailTransporter } from "../email/transporters";
import { StorageType } from "./apiTypes.gen";

/**
 * Apollo context object with dataSources. For details see:
 * https://www.apollographql.com/docs/apollo-server/data/data-sources/
 */
export interface GraphQLContext {
  dataSources: {
    db: DBAdapter;
    cache: CacheAdapter;
    search?: SearchAdapter;
  };
  emailTransporter: EmailTransporter;
  uploadProvider: StorageType;
  passport: PassportGraphQLMethods;
  logger: Logger;
  user?: Omit<User, "entityType">;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
