import { isUserHashInstanceAdmin } from "@local/hash-backend-utils/hash-instance";
import { getUserServiceUsage } from "@local/hash-backend-utils/service-usage";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import { AccountEntityId, extractAccountId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { ForbiddenError } from "apollo-server-express";

import { getEntities } from "../../../../graph/knowledge/primitive/entity";
import { Query, ResolverFn, UserUsageRecords } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const getUsageRecordsResolver: ResolverFn<
  Query["getUsageRecords"],
  Record<string, never>,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (_, __, graphQLContext) => {
  const { dataSources, authentication, user: requestingUser } = graphQLContext;
  const userIsAdmin = await isUserHashInstanceAdmin(
    { graphApi: dataSources.graphApi },
    authentication,
    { userAccountId: requestingUser.accountId },
  );

  if (!userIsAdmin) {
    throw new ForbiddenError("User is not a HASH instance admin");
  }

  const users = await getEntities(
    graphQLContextToImpureGraphContext(graphQLContext),
    authentication,
    {
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.user.entityTypeId,
              { ignoreParents: true },
            ),
          ],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
  ).then((subgraph) => getRoots(subgraph));

  const records: UserUsageRecords[] = [];
  for (const user of users) {
    const { email } = simplifyProperties(user.properties as UserProperties);
    const usageRecords = await getUserServiceUsage(
      { graphApi: dataSources.graphApi },
      authentication,
      {
        userAccountId: extractAccountId(
          user.metadata.recordId.entityId as AccountEntityId,
        ),
      },
    );
    records.push({ email: email[0], usageRecords });
  }

  return records;
};
