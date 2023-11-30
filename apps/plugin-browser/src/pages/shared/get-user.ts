import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { MeQuery, MeQueryVariables } from "../../graphql/api-types.gen";
import { meQuery } from "../../graphql/queries/user.queries";
import { queryGraphQlApi } from "../../shared/query-graphql-api";

export const getUser = () => {
  return queryGraphQlApi<MeQuery, MeQueryVariables>(meQuery)
    .then(({ data }) => {
      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.me.subgraph,
      );

      const user = getRoots(subgraph)[0] as unknown as User;

      return {
        ...user,
        properties: simplifyProperties(user.properties),
      };
    })
    .catch(() => null);
};
