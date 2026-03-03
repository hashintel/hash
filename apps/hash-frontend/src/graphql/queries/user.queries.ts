import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const isShortnameTaken = gql`
  query isShortnameTaken($shortname: String!) {
    isShortnameTaken(shortname: $shortname)
  }
`;

export const hasAccessToHashQuery = gql`
  query hasAccessToHash {
    hasAccessToHash
  }
`;

export const getWaitlistPositionQuery = gql`
  query getWaitlistPosition {
    getWaitlistPosition
  }
`;

export const meQuery = gql`
  query me {
    me {
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${subgraphFieldsFragment}
`;

export const submitEarlyAccessFormMutation = gql`
  mutation submitEarlyAccessForm($properties: ProspectiveUserProperties!) {
    submitEarlyAccessForm(properties: $properties)
  }
`;
