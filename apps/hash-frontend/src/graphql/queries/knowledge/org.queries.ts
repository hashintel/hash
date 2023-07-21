import { gql } from "@apollo/client";

import { subgraphFieldsFragment } from "../subgraph";

export const createOrgMutation = gql`
  mutation createOrg($shortname: String!, $name: String!, $website: String) {
    createOrg(shortname: $shortname, name: $name, website: $website) {
      ...SubgraphFields
    }
  }

  ${subgraphFieldsFragment}
`;
