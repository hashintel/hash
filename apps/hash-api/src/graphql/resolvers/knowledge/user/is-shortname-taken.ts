import {
  shortnameIsRestricted,
  shortnameIsTaken,
} from "../../../../graph/knowledge/system-types/account.fields";
import type {
  QueryIsShortnameTakenArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const isShortnameTakenResolver: ResolverFn<
  Promise<boolean>,
  {},
  GraphQLContext,
  QueryIsShortnameTakenArgs
> = async (_, { shortname }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  return (
    shortnameIsRestricted({ shortname }) ||
    (await shortnameIsTaken(context, authentication, { shortname }))
  );
};
