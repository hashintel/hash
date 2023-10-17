import { UserPermissionsOnEntities } from "@local/hash-graphql-shared/graphql/types";
import { GraphQLResolveInfo } from "graphql";
import { parseResolveInfo, ResolveTree } from "graphql-parse-resolve-info";

import { checkPermissionsOnEntitiesInSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { Subgraph, SubgraphAndPermissions } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";

const werePermissionsRequested = (info: GraphQLResolveInfo) => {
  const parsedResolveInfoFragment = parseResolveInfo(info);

  const requestedFieldsOnSubgraph =
    parsedResolveInfoFragment?.fieldsByTypeName.SubgraphAndPermissions;

  if (!requestedFieldsOnSubgraph) {
    throw new Error(`No Subgraph in parsed resolve info fragment`);
  }

  return {
    entities: !!(
      requestedFieldsOnSubgraph as Record<
        keyof SubgraphAndPermissions,
        ResolveTree
      >
    ).permissionsOnEntities,
  };
};

export const createSubgraphAndPermissionsReturn = async (
  context: Pick<GraphQLContext, "dataSources" | "authentication">,
  resolveInfo: GraphQLResolveInfo,
  subgraph: Subgraph,
): Promise<SubgraphAndPermissions> => {
  const { authentication, dataSources } = context;

  const permissionsOnEntities = werePermissionsRequested(resolveInfo).entities
    ? await checkPermissionsOnEntitiesInSubgraph(dataSources, authentication, {
        subgraph,
      })
    : /**
       * The GraphQL schema has this field as non-nullable, which it is if the user requests it.
       * Because we are checking whether it was requested or not ourselves, we can safely return null here.
       * This is the safest assertion available, which minimises the chance that we miss changes to the return type.
       */
      (null as unknown as UserPermissionsOnEntities);

  return {
    subgraph,
    permissionsOnEntities,
  };
};
