import { Entity } from "@hashintel/hash-subgraph";

import {
  getBlockById,
  getBlockData,
} from "../../../../graph/knowledge/system-types/block";
import { QueryBlocksArgs, ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";
import { mapEntityToGQL, UnresolvedBlockGQL } from "../graphql-mapping";

export const blockChildEntityResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedBlockGQL,
  GraphQLContext,
  QueryBlocksArgs
> = async ({ metadata }, _, { dataSources }) => {
  const context = dataSourceToImpureGraphContext(dataSources);

  const block = await getBlockById(context, {
    entityId: metadata.editionId.baseId,
  });

  return mapEntityToGQL(await getBlockData(context, { block }));
};
