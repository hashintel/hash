import {
  shortnameIsRestricted,
  shortnameIsTaken,
} from "../../../../graph/knowledge/system-types/account.fields";
import { QueryIsShortnameTakenArgs, ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";

export const isShortnameTakenResolver: ResolverFn<
  Promise<boolean>,
  {},
  GraphQLContext,
  QueryIsShortnameTakenArgs
> = async (_, { shortname }, { dataSources }) => {
  const context = dataSourceToImpureGraphContext(dataSources);

  return (
    shortnameIsRestricted({ shortname }) ||
    (await shortnameIsTaken(context, { shortname }))
  );
};
