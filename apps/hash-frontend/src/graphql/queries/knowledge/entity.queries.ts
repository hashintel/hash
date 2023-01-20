import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-subgraph";

export const createEntityMutation = gql`
  mutation createEntity(
    $entityTypeId: VersionedUri!
    $ownedById: OwnedById
    $properties: PropertyObject!
    $linkData: LinkData
  ) {
    # This is a scalar, which has no selection.
    createEntity(
      entityTypeId: $entityTypeId
      ownedById: $ownedById
      properties: $properties
      linkData: $linkData
    )
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
      isOfType: $isOfType
      hasLeftEntity: $hasLeftEntity
      hasRightEntity: $hasRightEntity
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getAllLatestEntitiesQuery = gql`
  query getAllLatestEntities(
    $rootEntityTypeIds: [VersionedUri!]
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinksOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
    $isOfType: OutgoingEdgeResolveDepthInput!
    $hasLeftEntity: EdgeResolveDepthsInput!
    $hasRightEntity: EdgeResolveDepthsInput!
  ) {
    getAllLatestEntities(
      rootEntityTypeIds: $rootEntityTypeIds
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
      isOfType: $isOfType
      hasLeftEntity: $hasLeftEntity
      hasRightEntity: $hasRightEntity
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const updateEntityMutation = gql`
  mutation updateEntity(
    $entityId: EntityId!
    $updatedProperties: PropertyObject!
    $leftToRightOrder: Int
    $rightToLeftOrder: Int
    $entityTypeId: VersionedUri
  ) {
    # This is a scalar, which has no selection.
    updateEntity(
      entityId: $entityId
      updatedProperties: $updatedProperties
      leftToRightOrder: $leftToRightOrder
      rightToLeftOrder: $rightToLeftOrder
      entityTypeId: $entityTypeId
    )
  }
`;

export const archiveEntityMutation = gql`
  mutation archiveEntity($entityId: EntityId!) {
    archiveEntity(entityId: $entityId)
  }
`;
