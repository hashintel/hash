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
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
      inheritsFrom: $inheritsFrom
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
    $inheritsFrom: OutgoingEdgeResolveDepthInput!
    $latestOnly: Boolean = true
    $includeArchived: Boolean = false
  ) {
    queryEntityTypes(
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
      inheritsFrom: $inheritsFrom
      latestOnly: $latestOnly
      includeArchived: $includeArchived
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const createEntityTypeMutation = gql`
  mutation createEntityType(
    $ownedById: OwnedById!
    $entityType: ConstructEntityTypeParams!
    $icon: String
  ) {
    # This is a scalar, which has no selection.
    createEntityType(
      ownedById: $ownedById
      entityType: $entityType
      icon: $icon
    )
  }
`;

export const updateEntityTypeMutation = gql`
  mutation updateEntityType(
    $entityTypeId: VersionedUrl!
    $updatedEntityType: ConstructEntityTypeParams!
    $icon: String
  ) {
    updateEntityType(
      entityTypeId: $entityTypeId
      updatedEntityType: $updatedEntityType
      icon: $icon
    )
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
