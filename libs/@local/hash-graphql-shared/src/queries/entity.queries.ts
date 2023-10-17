import { gql } from "@apollo/client";

import { subgraphFieldsFragment } from "./subgraph";

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
      permissionsOnEntities @include(if: $includePermissions)
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${subgraphFieldsFragment}
`;
