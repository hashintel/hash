import { gql } from "@apollo/client";

export const subgraphFieldsFragment = gql`
  fragment SubgraphFields on Subgraph {
    roots
    vertices
    edges
    depths {
      constrainsLinkDestinationsOn {
        outgoing
      }
      constrainsLinksOn {
        outgoing
      }
      constrainsValuesOn {
        outgoing
      }
      constrainsPropertiesOn {
        outgoing
      }
      inheritsFrom {
        outgoing
      }
      isOfType {
        outgoing
      }
      hasLeftEntity {
        incoming
        outgoing
      }
      hasRightEntity {
        incoming
        outgoing
      }
    }
    timeProjection
    resolvedTimeProjection
  }
`;
