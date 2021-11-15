import { Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model";

export const me: Resolver<UnresolvedGQLEntity, {}, LoggedInGraphQLContext> =
  async (_, __, { user }) => user.toGQLUnknownEntity();
