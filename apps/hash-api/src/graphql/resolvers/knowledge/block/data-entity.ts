import { Entity } from "@local/hash-subgraph/src";

import {
  getBlockById,
  getBlockData,
} from "../../../../graph/knowledge/system-types/block";
import { QueryBlocksArgs, ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapEntityToGQL, UnresolvedBlockGQL } from "../graphql-mapping";

export const blockChildEntityResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedBlockGQL,
  GraphQLContext,
  QueryBlocksArgs
> = async ({ metadata }, _, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const block = await getBlockById(context, {
    entityId: metadata.editionId.baseId,
  });

  return mapEntityToGQL(await getBlockData(context, { block }));
};
