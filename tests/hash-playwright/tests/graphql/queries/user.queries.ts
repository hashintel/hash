import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";
import { print } from "graphql";

export const meQuery = /* GraphQL */ `
  query me {
    me(
      hasLeftEntity: { incoming: 0, outgoing: 0 }
      hasRightEntity: { incoming: 0, outgoing: 0 }
    ) {
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${print(subgraphFieldsFragment)}
`;
