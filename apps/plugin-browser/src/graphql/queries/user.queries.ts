import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";
import { print } from "graphql";

export const meQuery = /* GraphQL */ `
  query me {
    me {
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${print(subgraphFieldsFragment)}
`;
