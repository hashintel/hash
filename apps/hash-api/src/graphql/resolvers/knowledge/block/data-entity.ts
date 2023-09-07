import { Entity } from "@local/hash-subgraph";

import { publicUserAccountId } from "../../../../graph";
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
> = async ({ metadata }, _, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);
  const authentication = { actorId: user?.accountId ?? publicUserAccountId };

  const block = await getBlockById(context, authentication, {
    entityId: metadata.recordId.entityId,
  });

  return mapEntityToGQL(await getBlockData(context, authentication, { block }));
};
