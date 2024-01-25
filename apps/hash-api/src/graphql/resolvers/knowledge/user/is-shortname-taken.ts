import {
  shortnameIsRestricted,
  shortnameIsTaken,
} from "../../../../graph/knowledge/system-types/account.fields";
import { QueryIsShortnameTakenArgs, ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const isShortnameTakenResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  GraphQLContext,
  QueryIsShortnameTakenArgs
> = async (_, { shortname }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  return (
    shortnameIsRestricted({ shortname }) ||
    (await shortnameIsTaken(context, authentication, { shortname }))
  );
};
