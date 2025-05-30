import type { Subgraph } from "@blockprotocol/graph";
import type { UserPermissionsOnEntities } from "@local/hash-graph-sdk/authorization";
import type { GraphQLResolveInfo } from "graphql";
import type { ResolveTree } from "graphql-parse-resolve-info";
import { parseResolveInfo } from "graphql-parse-resolve-info";

import { checkPermissionsOnEntitiesInSubgraph } from "../../../../graph/knowledge/primitive/entity";
import type { SubgraphAndPermissions } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

const werePermissionsRequested = (info: GraphQLResolveInfo) => {
  const parsedResolveInfoFragment = parseResolveInfo(info);

  const requestedFieldsOnSubgraph =
    parsedResolveInfoFragment?.fieldsByTypeName.SubgraphAndPermissions ||
    parsedResolveInfoFragment?.fieldsByTypeName.GetEntitySubgraphResponse;

  if (!requestedFieldsOnSubgraph) {
    throw new Error(`No Subgraph in parsed resolve info fragment`);
  }

  return {
    entities: !!(
      requestedFieldsOnSubgraph as Record<
        keyof SubgraphAndPermissions,
        ResolveTree
      >
    ).userPermissionsOnEntities,
  };
};

export const getUserPermissionsOnSubgraph = async (
  graphQLContext: GraphQLContext,
  resolveInfo: GraphQLResolveInfo,
  subgraph: Subgraph,
): Promise<UserPermissionsOnEntities> => {
  const { authentication } = graphQLContext;

  const userPermissionsOnEntities = werePermissionsRequested(resolveInfo)
    .entities
    ? await checkPermissionsOnEntitiesInSubgraph(
        graphQLContextToImpureGraphContext(graphQLContext),
        authentication,
        {
          subgraph,
        },
      )
    : /**
       * The GraphQL schema has this field as non-nullable, which it is if the user requests it.
       * Because we are checking whether it was requested or not ourselves, we can safely return null here.
       * This is the safest assertion available, which minimises the chance that we miss changes to the return type.
       */
      (null as unknown as UserPermissionsOnEntities);

  return userPermissionsOnEntities;
};
