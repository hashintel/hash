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
    temporalAxes
  }
`;
export const getEntityQuery = gql`
  query getEntity(
    $entityId: EntityId!
    $entityVersion: String
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinksOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
    $inheritsFrom: OutgoingEdgeResolveDepthInput!
    $isOfType: OutgoingEdgeResolveDepthInput!
    $hasLeftEntity: EdgeResolveDepthsInput!
    $hasRightEntity: EdgeResolveDepthsInput!
  ) {
    getEntity(
      entityId: $entityId
      entityVersion: $entityVersion
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
      inheritsFrom: $inheritsFrom
      isOfType: $isOfType
      hasLeftEntity: $hasLeftEntity
      hasRightEntity: $hasRightEntity
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;
