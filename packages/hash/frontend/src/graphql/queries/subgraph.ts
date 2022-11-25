import { gql } from "@apollo/client";

export const subgraphFieldsFragment = gql`
  fragment SubgraphFields on Subgraph {
    roots
    vertices
    edges
    depths {
      constrainsLinkDestinationsOn
      constrainsLinksOn
      constrainsValuesOn
      constrainsPropertiesOn
      inheritsFrom
      isOfType
      hasLeftEntity {
        incoming
        outgoing
      }
      hasRightEntity {
        incoming
        outgoing
      }
    }
  }
`;
