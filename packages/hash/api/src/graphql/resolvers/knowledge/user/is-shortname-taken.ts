import {
  shortnameIsRestricted,
  shortnameIsTaken,
} from "../../../../graph/knowledge/system-types/account.fields";
import { QueryIsShortnameTakenArgs, ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";

export const isShortnameTakenResolver: ResolverFn<
  Promise<boolean>,
  {},
  GraphQLContext,
  QueryIsShortnameTakenArgs
> = async (_, { shortname }, { dataSources: { graphApi } }) =>
  shortnameIsRestricted({ shortname }) ||
  (await shortnameIsTaken({ graphApi }, { shortname }));
