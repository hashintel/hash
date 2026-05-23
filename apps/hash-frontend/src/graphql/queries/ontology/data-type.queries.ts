import { gql } from "@apollo/client";

export const queryDataTypesQuery = gql`
  query queryDataTypes($request: QueryDataTypesParams!) {
    queryDataTypes(request: $request)
  }
`;

export const queryDataTypeSubgraphQuery = gql`
  query queryDataTypeSubgraph($request: QueryDataTypeSubgraphParams!) {
    queryDataTypeSubgraph(request: $request)
  }
`;

export const findDataTypeConversionTargetsQuery = gql`
  query findDataTypeConversionTargets($dataTypeIds: [VersionedUrl!]!) {
    findDataTypeConversionTargets(dataTypeIds: $dataTypeIds)
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
