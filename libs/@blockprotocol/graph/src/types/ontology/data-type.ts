import type { DataType, VersionedUrl } from "@blockprotocol/type-system/slim";

import type { QueryOperationInput } from "../entity.js";
import type { DataTypeRootType, Subgraph } from "../subgraph.js";

import type { OntologyElementMetadata } from "./metadata.js";

export interface DataTypeWithMetadata {
  schema: DataType;
  metadata: OntologyElementMetadata;
}

export interface QueryDataTypesData {
  graphResolveDepths?: Partial<Pick<Subgraph["depths"], "constrainsValuesOn">>;
}

export interface QueryDataTypesResult<T extends Subgraph<DataTypeRootType>> {
  results: T[];
  operation: QueryOperationInput;
}

export interface GetDataTypeData {
  dataTypeId: VersionedUrl;
}

/** @todo - introduce create/update data types when we support custom data types */

// type SystemDefinedDataTypeProperties = "$schema" | "$id" | "kind";

// export type CreateDataTypeData = {
//   dataType: Omit<DataType, SystemDefinedDataTypeProperties>;
// };

// export type UpdateDataTypeData = {
//   dataTypeId: VersionedUrl;
//   dataType: Omit<DataType, SystemDefinedDataTypeProperties>;
// };
