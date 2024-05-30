import { getHashInstance } from "@local/hash-backend-utils/hash-instance";
import type { SimpleEntity } from "@local/hash-graph-types/entity";

import type { ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const hashInstanceEntityResolver: ResolverFn<
  Promise<SimpleEntity>,
  Record<string, never>,
  GraphQLContext,
  Record<string, never>
> = async (_, __, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const hashInstance = await getHashInstance(context, authentication);

  return hashInstance.entity;
};
