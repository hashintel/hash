import { Entity } from "@hashintel/hash-subgraph";

import {
  getBlockById,
  getBlockData,
} from "../../../../graph/knowledge/system-types/block";
import { QueryBlocksArgs, ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";
import { mapEntityToGQL, UnresolvedBlockGQL } from "../graphql-mapping";

export const blockChildEntityResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedBlockGQL,
  GraphQLContext,
  QueryBlocksArgs
> = async ({ metadata }, _, { dataSources: { graphApi } }) => {
  const block = await getBlockById(
    { graphApi },
    {
      entityId: metadata.editionId.baseId,
    },
  );

  return mapEntityToGQL(await getBlockData({ graphApi }, { block }));
};
