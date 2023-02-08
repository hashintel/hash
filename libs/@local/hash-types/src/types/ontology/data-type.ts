import { DataTypeWithMetadata as DataTypeWithMetadataBp } from "@blockprotocol/graph";
import { DataType } from "@blockprotocol/type-system/slim";
import { Subtype } from "@local/advanced-types/subtype";

import { OntologyElementMetadata } from "./metadata";

export type DataTypeWithMetadata = Subtype<
  DataTypeWithMetadataBp,
  {
    schema: DataType;
    metadata: OntologyElementMetadata;
  }
>;
