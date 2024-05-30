import type { SimpleEntity } from "@local/hash-graph-types/entity";

import {
  getBlockById,
  getBlockData,
} from "../../../../graph/knowledge/system-types/block";
import type { ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedBlockGQL } from "../graphql-mapping";

export const blockChildEntityResolver: ResolverFn<
  Promise<SimpleEntity>,
  UnresolvedBlockGQL,
  GraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const block = await getBlockById(context, authentication, {
    entityId: metadata.recordId.entityId,
  });

  return getBlockData(context, authentication, { block });
};
