import { gql } from "@apollo/client";

import { subgraphFieldsFragment } from "../subgraph";

export const getEntityTypeQuery = gql`
  query getEntityType(
    $entityTypeId: VersionedUrl!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinksOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
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
  ) {
    queryEntityTypes(
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getEntityTypeRootedSubgraphQuery = gql`
  query getEntityTypeRootedSubgraph(
    $entityTypeId: VersionedUrl!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinksOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
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
