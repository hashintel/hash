import type { VersionedUrl } from "@blockprotocol/type-system";

import type { QueryOperationInput } from "../entity.js";
import type {
  DataTypeRootType,
  GraphResolveDepths,
  Subgraph,
} from "../subgraph.js";

export type QueryDataTypesData = {
  graphResolveDepths?: Partial<Pick<GraphResolveDepths, "constrainsValuesOn">>;
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
