import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const createOrgMutation = gql`
  mutation createOrg($shortname: String!, $name: String!, $websiteUrl: String) {
    createOrg(shortname: $shortname, name: $name, websiteUrl: $websiteUrl) {
      ...SubgraphFields
    }
  }

  ${subgraphFieldsFragment}
`;
