import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-graphql-shared/queries/subgraph";

export const createEntityMutation = gql`
  mutation createEntity(
    $entityTypeId: VersionedUrl!
    $ownedById: OwnedById
    $properties: EntityPropertiesObject!
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

export const queryEntitiesQuery = gql`
  query queryEntities(
    $operation: QueryOperationInput!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinksOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
    $inheritsFrom: OutgoingEdgeResolveDepthInput!
    $isOfType: OutgoingEdgeResolveDepthInput!
    $hasLeftEntity: EdgeResolveDepthsInput!
    $hasRightEntity: EdgeResolveDepthsInput!
  ) {
    queryEntities(
      operation: $operation
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

export const structuralQueryEntitiesQuery = gql`
  query structuralQueryEntities($query: EntityStructuralQuery!) {
    structuralQueryEntities(query: $query) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const updateEntityMutation = gql`
  mutation updateEntity(
    $entityId: EntityId!
    $updatedProperties: EntityPropertiesObject!
    $leftToRightOrder: Int
    $rightToLeftOrder: Int
    $entityTypeId: VersionedUrl
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
