import { QueryIsShortnameTakenArgs, ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { AccountFields } from "../../../model";

export const isShortnameTaken: ResolverFn<
  Promise<boolean>,
  {},
  GraphQLContext,
  QueryIsShortnameTakenArgs
> = async (_, { shortname }, { dataSources: { graphApi } }) =>
  AccountFields.shortnameIsRestricted(shortname) ||
  (await AccountFields.shortnameIsTaken(graphApi, { shortname }));
