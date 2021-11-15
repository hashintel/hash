import { QueryIsShortnameTakenArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { User } from "../../../model";

export const isShortnameTaken: Resolver<
  Promise<boolean>,
  {},
  GraphQLContext,
  QueryIsShortnameTakenArgs
> = async (_, { shortname }, { dataSources }) =>
  dataSources.db.transaction(
    async (client) =>
      User.isShortnameReserved(shortname) ||
      (await User.isShortnameTaken(client, shortname)),
  );
