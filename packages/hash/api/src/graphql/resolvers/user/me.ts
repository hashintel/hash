import { ResolverFn } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model";

export const me: ResolverFn<
  UnresolvedGQLEntity,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { user }) => user.toGQLUnknownEntity();
