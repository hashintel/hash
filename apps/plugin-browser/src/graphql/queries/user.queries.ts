import { subgraphFieldsFragment } from "@local/hash-graphql-shared/queries/subgraph";
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
