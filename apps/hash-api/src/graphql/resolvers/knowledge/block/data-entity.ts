import { Entity } from "@local/hash-subgraph";

import {
  getBlockById,
  getBlockData,
} from "../../../../graph/knowledge/system-types/block";
import { ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { mapEntityToGQL, UnresolvedBlockGQL } from "../graphql-mapping";

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
