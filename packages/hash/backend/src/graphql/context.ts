import { Logger } from "winston";
import { PassportGraphQLMethods } from "../auth/passport";

import { User } from "../model";
import { DBAdapter } from "../db";
import EmailTransporter from "../email/transporter";

/**
 * Apollo context object with dataSources. For details see:
 * https://www.apollographql.com/docs/apollo-server/data/data-sources/
 */
export interface GraphQLContext {
  dataSources: {
    db: DBAdapter;
  };
  emailTransporter: EmailTransporter;
  passport: PassportGraphQLMethods;
  logger: Logger;
  user?: Omit<User, "entityType">;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
