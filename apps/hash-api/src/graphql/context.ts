import { Logger } from "@local/hash-backend-utils/logger";
import { SearchAdapter } from "@local/hash-backend-utils/search/adapter";
import { AccountId } from "@local/hash-subgraph";

import { CacheAdapter } from "../cache";
import { EmailTransporter } from "../email/transporters";
import { User } from "../graph/knowledge/system-types/user";
import { GraphApi } from "../graph/util";
import { UploadableStorageProvider } from "../storage";
import { TemporalClient } from "../temporal";
import { VaultClient } from "../vault";

export const publicUserAccountId: AccountId =
  "00000000-0000-0000-0000-000000000000" as AccountId;

export type AuthenticationContext = {
  actorId: AccountId;
};

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
  temporal?: TemporalClient;
  vault?: VaultClient;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
