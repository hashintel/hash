import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";
import { print } from "graphql";

export const meQuery = /* GraphQL */ `
  query me {
    me(
      # Depths are required for the user's avatar (1), orgs (1), and orgs' avatars (2)
      hasLeftEntity: { incoming: 2, outgoing: 0 }
      hasRightEntity: { incoming: 0, outgoing: 2 }
    ) {
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${print(subgraphFieldsFragment)}
`;
