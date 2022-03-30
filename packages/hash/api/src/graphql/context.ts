import { Logger } from "@hashintel/hash-backend-utils/logger";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";

import { PassportGraphQLMethods } from "../auth/passport";
import { User } from "../model";
import { DbAdapter } from "../db";
import { CacheAdapter } from "../cache";
import { EmailTransporter } from "../email/transporters";
import { StorageType } from "./apiTypes.gen";
import { TemporalWorkflowPool } from "../temporal/createTemporalWorkflowPool";

/**
 * Apollo context object with dataSources. For details see:
 * https://www.apollographql.com/docs/apollo-server/data/data-sources/
 */
export interface GraphQLContext {
  dataSources: {
    db: DbAdapter;
    cache: CacheAdapter;
    wf: TemporalWorkflowPool;
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
