import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-graphql-shared/queries/subgraph";

export const createOrgMutation = gql`
  mutation createOrg($shortname: String!, $name: String!, $website: String) {
    createOrg(shortname: $shortname, name: $name, website: $website) {
      ...SubgraphFields
    }
  }

  ${subgraphFieldsFragment}
`;
