import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type {
  PropertyMetadata,
  PropertyMetadataObject,
  PropertyMetadataValue,
  PropertyPath,
} from "@local/hash-graph-types/entity";
import type { ClosedDataTypeDefinition } from "@local/hash-graph-types/ontology";

import type { VerticalIndentationLineDir } from "../../../../../../../../components/grid/utils/draw-vertical-indentation-line";
import type { MinimalPropertyValidationReport } from "../../../../../../../shared/use-validate-entity";

export type PropertyRow = {
  children: PropertyRow[];
  depth: number;
  generateNewMetadataObject: (args: {
    /**
     * The path to the property in the entity's properties (i.e. row.propertyKeyChain)
     */
    propertyKeyChain: PropertyPath;
    /**
     * The path to the leaf value in the entity's properties,
     * which will start with propertyKeyChain, but may have additional array indices (depending on the property's structure)
     */
    valuePath: PropertyPath;
    /**
     * The metadata to set for the leaf value
     */
    valueMetadata: PropertyMetadataValue | "delete";
  }) => {
    entityPropertiesMetadata: PropertyMetadataObject;
    propertyMetadata: PropertyMetadata | undefined;
  };
  indent: number;
  isArray: boolean;
  isSingleUrl: boolean;
  maxItems?: number;
  minItems?: number;
  permittedDataTypes: ClosedDataTypeDefinition[];
  permittedDataTypesIncludingChildren: ClosedDataTypeDefinition[];
  propertyKeyChain: PropertyPath;
  required: boolean;
  rowId: string;
  title: string;
  validationError?: MinimalPropertyValidationReport;
  value: unknown;
  valueMetadata?: PropertyMetadata;
  verticalLinesForEachIndent: VerticalIndentationLineDir[];
};

export type PropertyColumnKey = Extract<
  keyof PropertyRow,
  "title" | "value" | "permittedDataTypes"
>;

export interface PropertyColumn extends SizedGridColumn {
  id: PropertyColumnKey;
}
