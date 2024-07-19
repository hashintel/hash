import { gql } from "@apollo/client";

import { subgraphFieldsFragment } from "./subgraph.js";

export const getEntityQuery = gql`
  query getEntity(
    $entityId: EntityId!
    $entityVersion: String
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinksOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
    $includePermissions: Boolean!
    $inheritsFrom: OutgoingEdgeResolveDepthInput!
    $isOfType: OutgoingEdgeResolveDepthInput!
    $hasLeftEntity: EdgeResolveDepthsInput!
    $hasRightEntity: EdgeResolveDepthsInput!
    $includeDrafts: Boolean
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
      includeDrafts: $includeDrafts
    ) {
      userPermissionsOnEntities @include(if: $includePermissions)
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${subgraphFieldsFragment}
`;

export const checkUserPermissionsOnEntityQuery = gql`
  query checkUserPermissionsOnEntity($metadata: EntityMetadata!) {
    checkUserPermissionsOnEntity(metadata: $metadata)
  }
`;
