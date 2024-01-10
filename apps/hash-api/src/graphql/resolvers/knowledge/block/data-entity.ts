import type { Entity } from "@local/hash-subgraph";

import {
  getBlockById,
  getBlockData,
} from "../../../../graph/knowledge/system-types/block";
import type { ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import type { UnresolvedBlockGQL } from "../graphql-mapping";
import { mapEntityToGQL } from "../graphql-mapping";

export const blockChildEntityResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedBlockGQL,
  GraphQLContext,
  {}
> = async ({ metadata }, _, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const block = await getBlockById(context, authentication, {
    entityId: metadata.recordId.entityId,
  });

  return mapEntityToGQL(await getBlockData(context, authentication, { block }));
};
