import type { DataType, VersionedUrl } from "@blockprotocol/type-system/slim";

import type { QueryOperationInput } from "../entity.js";
import type { DataTypeRootType, Subgraph } from "../subgraph.js";
import type { OntologyElementMetadata } from "./metadata.js";

export type DataTypeWithMetadata = {
  schema: DataType;
  metadata: OntologyElementMetadata;
};

export type QueryDataTypesData = {
  graphResolveDepths?: Partial<Pick<Subgraph["depths"], "constrainsValuesOn">>;
};

export type QueryDataTypesResult<T extends Subgraph<DataTypeRootType>> = {
  results: T[];
  operation: QueryOperationInput;
};

export type GetDataTypeData = {
  dataTypeId: VersionedUrl;
};

/** @todo - introduce create/update data types when we support custom data types */

// type SystemDefinedDataTypeProperties = "$schema" | "$id" | "kind";

// export type CreateDataTypeData = {
//   dataType: Omit<DataType, SystemDefinedDataTypeProperties>;
// };

// export type UpdateDataTypeData = {
//   dataTypeId: VersionedUrl;
//   dataType: Omit<DataType, SystemDefinedDataTypeProperties>;
// };
