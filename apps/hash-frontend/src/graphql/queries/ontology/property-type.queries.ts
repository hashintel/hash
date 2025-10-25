import { gql } from "@apollo/client";

export const queryPropertyTypesQuery = gql`
  query queryPropertyTypes($request: QueryPropertyTypesParams!) {
    queryPropertyTypes(request: $request)
  }
`;

export const queryPropertyTypeSubgraphQuery = gql`
  query queryPropertyTypeSubgraph($request: QueryPropertyTypeSubgraphParams!) {
    queryPropertyTypeSubgraph(request: $request)
  }
`;

export const createPropertyTypeMutation = gql`
  mutation createPropertyType(
    $webId: WebId!
    $propertyType: ConstructPropertyTypeParams!
  ) {
    # This is a scalar, which has no selection.
    createPropertyType(webId: $webId, propertyType: $propertyType)
  }
`;

export const updatePropertyTypeMutation = gql`
  mutation updatePropertyType(
    $propertyTypeId: VersionedUrl!
    $updatedPropertyType: ConstructPropertyTypeParams!
  ) {
    # This is a scalar, which has no selection.
    updatePropertyType(
      propertyTypeId: $propertyTypeId
      updatedPropertyType: $updatedPropertyType
    )
  }
`;

export const archivePropertyTypeMutation = gql`
  mutation archivePropertyType($propertyTypeId: VersionedUrl!) {
    archivePropertyType(propertyTypeId: $propertyTypeId)
  }
`;

export const unarchivePropertyTypeMutation = gql`
  mutation unarchivePropertyType($propertyTypeId: VersionedUrl!) {
    unarchivePropertyType(propertyTypeId: $propertyTypeId)
  }
`;
