import type { SerializedEntity } from "@local/hash-graph-sdk/entity";

import {
  getBlockById,
  getBlockData,
} from "../../../../graph/knowledge/system-types/block.js";
import type { ResolverFn } from "../../../api-types.gen.js";
import type { GraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type { UnresolvedBlockGQL } from "../graphql-mapping.js";

export const blockChildEntityResolver: ResolverFn<
  Promise<SerializedEntity>,
  UnresolvedBlockGQL,
  GraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const block = await getBlockById(context, authentication, {
    entityId: metadata.recordId.entityId,
  });

  return getBlockData(context, authentication, { block }).then((blockData) =>
    blockData.toJSON(),
  );
};
