import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { queryApi } from "./query-api";

const meQuery = /* GraphQL */ `
  {
    me {
      roots
      vertices
    }
  }
`;

export const getUser = () => {
  return queryApi(meQuery)
    .then(
      ({
        data: { me: subgraph },
      }: {
        data: { me: Subgraph<EntityRootType> };
      }) => {
        const user = getRoots(subgraph)[0] as unknown as User;
        return {
          ...user,
          properties: simplifyProperties(user.properties),
        };
      },
    )
    .catch(() => null);
};
