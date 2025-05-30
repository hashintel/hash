import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const getDataTypeQuery = gql`
  query getDataType(
    $dataTypeId: VersionedUrl!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $includeArchived: Boolean = false
  ) {
    getDataType(
      dataTypeId: $dataTypeId
      constrainsValuesOn: $constrainsValuesOn
      includeArchived: $includeArchived
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const queryDataTypesQuery = gql`
  query queryDataTypes(
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $includeArchived: Boolean = false
    $filter: Filter
    $inheritsFrom: OutgoingEdgeResolveDepthInput!
    $latestOnly: Boolean = true
  ) {
    queryDataTypes(
      constrainsValuesOn: $constrainsValuesOn
      includeArchived: $includeArchived
      filter: $filter
      inheritsFrom: $inheritsFrom
      latestOnly: $latestOnly
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getDataTypeConversionTargetsQuery = gql`
  query getDataTypeConversionTargets($dataTypeIds: [VersionedUrl!]!) {
    getDataTypeConversionTargets(dataTypeIds: $dataTypeIds)
  }
`;

export const checkUserPermissionsOnDataTypeQuery = gql`
  query checkUserPermissionsOnDataType($dataTypeId: VersionedUrl!) {
    checkUserPermissionsOnDataType(dataTypeId: $dataTypeId)
  }
`;

export const createDataTypeMutation = gql`
  mutation createDataType(
    $webId: WebId!
    $dataType: ConstructDataTypeParams!
    $conversions: DataTypeDirectConversionsMap
  ) {
    createDataType(webId: $webId, dataType: $dataType, conversions: $conversions)
  }
`;

export const updateDataTypeMutation = gql`
  mutation updateDataType(
    $dataTypeId: VersionedUrl!
    $dataType: ConstructDataTypeParams!
    $conversions: DataTypeDirectConversionsMap
  ) {
    updateDataType(dataTypeId: $dataTypeId, dataType: $dataType, conversions: $conversions)
  }
`;
