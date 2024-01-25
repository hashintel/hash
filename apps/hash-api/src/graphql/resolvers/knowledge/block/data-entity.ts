import { Entity } from "@local/hash-subgraph";

import {
  getBlockById,
  getBlockData,
} from "../../../../graph/knowledge/system-types/block";
import { ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapEntityToGQL, UnresolvedBlockGQL } from "../graphql-mapping";

export const blockChildEntityResolver: ResolverFn<
  Promise<Entity>,
  UnresolvedBlockGQL,
  GraphQLContext,
  Record<string, never>
> = async ({ metadata }, _, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const block = await getBlockById(context, authentication, {
    entityId: metadata.recordId.entityId,
  });

  return mapEntityToGQL(await getBlockData(context, authentication, { block }));
};
