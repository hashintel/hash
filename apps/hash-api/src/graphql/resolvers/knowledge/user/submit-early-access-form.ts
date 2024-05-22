import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { OwnedById } from "@local/hash-subgraph";

import { createEntity } from "../../../../graph/knowledge/primitive/entity";
import { systemAccountId } from "../../../../graph/system-account";
import type {
  MutationSubmitEarlyAccessFormArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const submitEarlyAccessFormResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationSubmitEarlyAccessFormArgs
> = async (_, { properties }, graphQLContext) => {
  const { user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  await createEntity(
    context,
    /** The user does not yet have permissions to create entities, so we do it with the HASH system account instead */
    { actorId: systemAccountId },
    {
      ownedById: user.accountId as OwnedById,
      entityTypeId: systemEntityTypes.prospectiveUser.entityTypeId,
      properties,
      relationships: createDefaultAuthorizationRelationships({
        actorId: systemAccountId,
      }),
    },
  );

  return true;
};
