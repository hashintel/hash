import type { Entity } from "@local/hash-subgraph";

import {
  getBlockById,
  getBlockData,
} from "../../../../graph/knowledge/system-types/block";
import type { ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedBlockGQL } from "../graphql-mapping";
import { mapEntityToGQL } from "../graphql-mapping";

export const blockChildEntityResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedBlockGQL,
  GraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const block = await getBlockById(context, authentication, {
    entityId: metadata.recordId.entityId,
  });

  return mapEntityToGQL(await getBlockData(context, authentication, { block }));
};
