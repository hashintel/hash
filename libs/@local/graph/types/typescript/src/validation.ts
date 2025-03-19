import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ArrayItemNumberMismatch as ArrayItemNumberMismatchGraphApi,
  ArrayValidationReport as ArrayValidationReportGraphApi,
  DataTypeCanonicalCalculation as DataTypeCanonicalCalculationGraphApi,
  DataTypeConversionError as DataTypeConversionErrorGraphApi,
  DataTypeInferenceError as DataTypeInferenceErrorGraphApi,
  EntityTypesError as EntityTypesErrorGraphApi,
  EntityValidationReport as EntityValidationReportGraphApi,
  JsonSchemaValueTypeMismatch as JsonSchemaValueTypeMismatchGraphApi,
  LinkDataStateError as LinkDataStateErrorGraphApi,
  LinkedEntityError as LinkedEntityErrorGraphApi,
  LinkError as LinkErrorGraphApi,
  LinkTargetError as LinkTargetErrorGraphApi,
  LinkValidationReport as LinkValidationReportGraphApi,
  MetadataValidationReport as MetadataValidationReportGraphApi,
  ObjectPropertyValidationReport as ObjectPropertyValidationReportGraphApi,
  ObjectValidationReport as ObjectValidationReportGraphApi,
  PropertyArrayValidationReport as PropertyArrayValidationReportGraphApi,
  PropertyObjectValidationReport as PropertyObjectValidationReportGraphApi,
  PropertyValidationReport as PropertyValidationReportGraphApi,
  PropertyValueTypeMismatch as PropertyValueTypeMismatchGraphApi,
  PropertyValueValidationReport as PropertyValueValidationReportGraphApi,
  Report,
  UnexpectedEntityType as UnexpectedEntityTypeGraphApi,
  ValueValidationError as ValueValidationErrorGraphApi,
  ValueValidationReport as ValueValidationReportGraphApi,
} from "@local/hash-graph-client";

export type EntityValidationReport = Omit<
  EntityValidationReportGraphApi,
  "properties" | "link" | "metadata"
> & {
  link?: LinkValidationReport;
  metadata?: MetadataValidationReport;
} & ObjectValidationReport;

export type ObjectPropertyValidationReport = Subtype<
  ObjectPropertyValidationReportGraphApi,
  | {
      // The property was found at the entity but is not expected in the schema
      type: "unexpected";
    }
  | {
      // It was not possible for the graph to read the property type
      type: "retrieval";
      error: Report;
    }
  | {
      // The property was found at the entity but the property type is not the expected type from the schema
      type: "wrongType";
      data: PropertyValueTypeMismatchGraphApi;
    }
  | PropertyValidationReport
  | ({
      // The validation of the property array failed
      type: "propertyArray";
    } & ArrayValidationReport)
  | {
      // The property is required by the schema but is missing from the entity
      type: "missing";
    }
>;

export type JsonSchemaValueTypeMismatch = Omit<
  JsonSchemaValueTypeMismatchGraphApi,
  "actual" | "expected"
> & {
  actual: [VersionedUrl, ...VersionedUrl[]];
  expected: [VersionedUrl, ...VersionedUrl[]];
};

export type PropertyValidationReport = Subtype<
  PropertyValidationReportGraphApi,
  | {
      // The property value validation failed
      type: "value";
      /*
       * Validation for each constraint in the `oneOf` field. The validation is assumed to pass if at least one of the
       * constraints passes. In this case, this field will be omitted. Whenever this field is present it can be assumed
       * that the validation failed.
       */
      validations?: PropertyValueValidationReport[];
      // It was not possible to infer the correct data type ID for the property.
      dataTypeInference?: DataTypeInferenceError[];
      // Converting the data type from `originalDataTypeId` to `dataTypeId` failed
      valueConversion?: DataTypeConversionErrorGraphApi;
      // It was not possible to convert the value to its canonical forms.
      canonicalValue?: DataTypeCanonicalCalculationGraphApi[];
    }
  | {
      // The property array validation failed
      type: "array";
      /*
       * Validation for each constraint in the `oneOf` field. The validation is assumed to pass if at least one of the
       * constraints passes. In this case, this field will be omitted. Whenever this field is present it can be assumed
       * that the validation failed.
       */
      validations?: PropertyArrayValidationReport[];
    }
  | {
      // The property object validation failed
      type: "object";
      /*
       * Validation for each constraint in the `oneOf` field. The validation is assumed to pass if at least one of the
       * constraints passes. In this case, this field will be omitted. Whenever this field is present it can be assumed
       * that the validation failed.
       */
      validations?: PropertyObjectValidationReport[];
    }
>;

export type PropertyValueValidationReport = Subtype<
  PropertyValueValidationReportGraphApi,
  | {
      type: "wrongType";
      data: PropertyValueTypeMismatchGraphApi;
    }
  | {
      type: "valueValidation";
      data: ValueValidationReport;
    }
>;

export type ValueValidationReport = Omit<
  ValueValidationReportGraphApi,
  "actual" | "desired" | "abstract" | "incompatible"
> & {
  // The value could not be validated against the provided data type.
  provided?: ValueValidationError;
  // The value could not be validated against the data type specified in the schema.
  // This will only be reported if the provided data type differes from the target data type.
  target?: ValueValidationError;
  // The provided DataType is abstract
  abstract?: VersionedUrl;
  // The provided DataType is incompatible with the desired DataType,
  // i.e. the actual DataType is not a subtype of the target DataType
  incompatible?: VersionedUrl;
};

export type ValueValidationError = Subtype<
  ValueValidationErrorGraphApi,
  { type: "retrieval"; error: Report } | { type: "constraints"; error: Report }
>;

export type PropertyArrayValidationReport = Subtype<
  PropertyArrayValidationReportGraphApi,
  | {
      type: "wrongType";
      data: PropertyValueTypeMismatchGraphApi;
    }
  | {
      type: "arrayValidation";
      data: ArrayValidationReport;
    }
>;

export type ArrayValidationReport = Omit<
  ArrayValidationReportGraphApi,
  "numItems" | "items"
> & {
  numItems?: ArrayItemNumberMismatchGraphApi;
  items?: { [index: string]: PropertyValidationReport };
};

export type PropertyObjectValidationReport = Subtype<
  PropertyObjectValidationReportGraphApi,
  | {
      type: "wrongType";
      data: PropertyValueTypeMismatchGraphApi;
    }
  | {
      type: "objectValidation";
      data: ObjectValidationReport;
    }
>;

export type ObjectValidationReport = Omit<
  ObjectValidationReportGraphApi,
  "properties"
> & {
  properties?: { [property: BaseUrl]: ObjectPropertyValidationReport };
};

export type DataTypeInferenceError = Subtype<
  DataTypeInferenceErrorGraphApi,
  | { type: "retrieval"; error: Report }
  | { type: "abstract"; data: VersionedUrl }
  | { type: "ambiguous"; data: VersionedUrl[] }
>;

export type MetadataValidationReport = Omit<
  MetadataValidationReportGraphApi,
  "entityTypes" | "properties"
> & {
  entityTypes?: EntityTypesErrorGraphApi;
  properties?: never;
};

export type LinkValidationReport = Omit<
  LinkValidationReportGraphApi,
  "linkData" | "leftEntity" | "linkType" | "rightEntity" | "targetType"
> & {
  linkData?: LinkDataStateErrorGraphApi;
  leftEntity?: LinkedEntityErrorGraphApi;
  linkType?: LinkError;
  rightEntity?: LinkedEntityErrorGraphApi;
  targetType?: LinkTargetError;
};

export type LinkError = Subtype<
  LinkErrorGraphApi,
  { type: "unexpectedEntityType"; data: UnexpectedEntityType }
>;

export type LinkTargetError = Subtype<
  LinkTargetErrorGraphApi,
  { type: "unexpectedEntityType"; data: UnexpectedEntityType }
>;

export type UnexpectedEntityType = Omit<
  UnexpectedEntityTypeGraphApi,
  "actual" | "expected"
> & {
  actual: [VersionedUrl, ...VersionedUrl[]];
  expected: [VersionedUrl, ...VersionedUrl[]];
};
