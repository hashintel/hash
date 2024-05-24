import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
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

  const adminAccountGroupId = await getHashInstanceAdminAccountGroupId(
    context,
    { actorId: systemAccountId },
  );

  await createEntity(
    context,
    /** The user does not yet have permissions to create entities, so we do it with the HASH system account instead */
    { actorId: systemAccountId },
    {
      ownedById: user.accountId as OwnedById,
      entityTypeId: systemEntityTypes.prospectiveUser.entityTypeId,
      properties,
      relationships: [
        {
          relation: "administrator",
          subject: {
            kind: "account",
            subjectId: systemAccountId,
          },
        },
        {
          relation: "viewer",
          subject: {
            kind: "accountGroup",
            subjectId: adminAccountGroupId,
          },
        },
        {
          relation: "setting",
          subject: {
            kind: "setting",
            subjectId: "administratorFromWeb",
          },
        },

        {
          relation: "setting",
          subject: {
            kind: "setting",
            subjectId: "viewFromWeb",
          },
        },
      ],
    },
  );

  return true;
};
