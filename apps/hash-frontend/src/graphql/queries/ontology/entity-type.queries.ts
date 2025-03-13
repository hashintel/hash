import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const getEntityTypeQuery = gql`
  query getEntityType(
    $entityTypeId: VersionedUrl!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinksOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
    $inheritsFrom: OutgoingEdgeResolveDepthInput!
    $includeArchived: Boolean = false
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
      inheritsFrom: $inheritsFrom
      includeArchived: $includeArchived
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const queryEntityTypesQuery = gql`
  query queryEntityTypes(
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinksOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
    $filter: Filter
    $inheritsFrom: OutgoingEdgeResolveDepthInput!
    $latestOnly: Boolean = true
    $includeArchived: Boolean = false
  ) {
    queryEntityTypes(
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
      filter: $filter
      inheritsFrom: $inheritsFrom
      latestOnly: $latestOnly
      includeArchived: $includeArchived
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getClosedMultiEntityTypesQuery = gql`
  query getClosedMultiEntityTypes(
    $entityTypeIds: [[VersionedUrl!]!]!
    $includeArchived: Boolean = false
  ) {
    getClosedMultiEntityTypes(
      entityTypeIds: $entityTypeIds
      includeArchived: $includeArchived
    ) {
      closedMultiEntityTypes
      definitions
    }
  }
`;

export const createEntityTypeMutation = gql`
  mutation createEntityType(
    $ownedById: OwnedById!
    $entityType: ConstructEntityTypeParams!
  ) {
    # This is a scalar, which has no selection.
    createEntityType(ownedById: $ownedById, entityType: $entityType)
  }
`;

export const updateEntityTypeMutation = gql`
  mutation updateEntityType(
    $entityTypeId: VersionedUrl!
    $updatedEntityType: ConstructEntityTypeParams!
  ) {
    updateEntityType(
      entityTypeId: $entityTypeId
      updatedEntityType: $updatedEntityType
    )
  }
`;

export const updateEntityTypesMutation = gql`
  mutation updateEntityTypes($updates: [EntityTypeUpdate!]!) {
    updateEntityTypes(updates: $updates)
  }
`;

export const archiveEntityTypeMutation = gql`
  mutation archiveEntityType($entityTypeId: VersionedUrl!) {
    archiveEntityType(entityTypeId: $entityTypeId)
  }
`;

export const unarchiveEntityTypeMutation = gql`
  mutation unarchiveEntityType($entityTypeId: VersionedUrl!) {
    unarchiveEntityType(entityTypeId: $entityTypeId)
  }
`;

export const checkUserPermissionsOnEntityTypeQuery = gql`
  query checkUserPermissionsOnEntityType($entityTypeId: VersionedUrl!) {
    checkUserPermissionsOnEntityType(entityTypeId: $entityTypeId)
  }
`;
