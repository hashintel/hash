import {
  QueryIsShortnameTakenArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { GraphQLContext } from "./embed/context";
import { AccountFields } from "../../auth/model";

export const isShortnameTaken: ResolverFn<
  Promise<boolean>,
  {},
  GraphQLContext,
  QueryIsShortnameTakenArgs
> = async (_, { shortname }, { dataSources: { graphApi } }) =>
  AccountFields.shortnameIsRestricted(shortname) ||
  (await AccountFields.shortnameIsTaken(graphApi, { shortname }));
