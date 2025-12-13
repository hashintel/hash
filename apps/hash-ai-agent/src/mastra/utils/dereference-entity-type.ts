import type {
  BaseUrl,
  DataType,
  EntityType,
  OneOfSchema,
  PropertyType,
  PropertyValueArray,
  PropertyValueObject,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";

// import { generateSimplifiedTypeId } from "../infer-entities/shared/generate-simplified-type-id.js";

type MinimalDataType = DistributiveOmit<DataType, "$schema" | "kind" | "allOf">;

export type MinimalPropertyObject = PropertyValueObject<
  ValueOrArray<DereferencedPropertyType>
> & { additionalProperties: false };

export type MinimalPropertyTypeValue =
  | MinimalDataType
  | MinimalPropertyObject
  | PropertyValueArray<OneOfSchema<MinimalPropertyTypeValue>>;

export type DereferencedPropertyType = Pick<
  PropertyType,
  "$id" | "description" | "title"
> &
  OneOfSchema<MinimalPropertyTypeValue>;

/**
 * An entity type with all its dependencies dereferenced and their simplified schemas in-lined.
 *
 * If the dereference function is called with `simplifyPropertyKeys` set to `true`, the property keys in the schema
 * will be simplified from BaseUrls to simple strings. The mapping back to BaseUrls is returned from the function
 */
export type DereferencedEntityType<
  PropertyTypeKey extends string | BaseUrl = BaseUrl,
> = Pick<
  EntityType,
  "$id" | "description" | "links" | "required" | "title" | "labelProperty"
> & {
  properties: Record<
    PropertyTypeKey,
    DereferencedPropertyType | PropertyValueArray<DereferencedPropertyType>
  >;
  additionalProperties: false;
};

export type DereferencedEntityTypeWithSimplifiedKeys = {
  isLink: boolean;
  parentIds: VersionedUrl[];
  schema: DereferencedEntityType<string>;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  reverseSimplifiedPropertyTypeMappings: Record<BaseUrl, string>;
};
