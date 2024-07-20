import { ForbiddenError } from "apollo-server-express";
import { isUserHashInstanceAdmin } from "@local/hash-backend-utils/hash-instance";
import { getWebServiceUsage } from "@local/hash-backend-utils/service-usage";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import type { AccountEntityId, extractAccountId } from "@local/hash-subgraph";
import { getEntities } from "../../../../graph/knowledge/primitive/entity";
import type {
  Query,
  ResolverFn,
  UserUsageRecords,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
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
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.user.entityTypeId,
            { ignoreParents: true },
          ),
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    },
  );

  const records: UserUsageRecords[] = [];

  // @todo support getting org usage records
  for (const user of users) {
    const { shortname } = simplifyProperties(user.properties as UserProperties);

    const userAccountId = extractAccountId(
      user.metadata.recordId.entityId as AccountEntityId,
    );

    const usageRecords = await getWebServiceUsage(
      { graphApi: dataSources.graphApi },
      {
        userAccountId,
        webId: userAccountId as OwnedById,
      },
    );

    records.push({ shortname: shortname ?? "NO SHORTNAME", usageRecords });
  }

  return records;
};
