import { QueryIsShortnameTakenArgs, ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UserModel } from "../../../model";

export const isShortnameTaken: ResolverFn<
  Promise<boolean>,
  {},
  GraphQLContext,
  QueryIsShortnameTakenArgs
> = async (_, { shortname }, { dataSources: { graphApi } }) =>
  UserModel.shortnameIsRestricted(shortname) ||
  (await UserModel.shortnameIsTaken(graphApi, { shortname }));
