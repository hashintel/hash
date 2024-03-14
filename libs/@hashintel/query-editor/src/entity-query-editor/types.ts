import type {
  BaseUrl,
  Entity,
  MultiFilter,
  MultiFilterOperatorType,
} from "@blockprotocol/graph";

export type FilterType = "Type" | "Property";

export type TypeOperator = "is";

interface TypeFilter {
  type: "Type";
  operator: TypeOperator;
  value: string;
}

type PropertyOperatorWithoutValue = "is empty" | "is not empty";
type PropertyOperatorWithValue =
  | "is"
  | "is not"
  | "contains"
  | "does not contain";

export type PropertyOperator =
  | PropertyOperatorWithoutValue
  | PropertyOperatorWithValue;

export type FilterValue = boolean | number | string;
export type FilterValueType = "boolean" | "number" | "string";

interface PropertyFilterWithValue {
  type: "Property";
  operator: PropertyOperatorWithValue;
  propertyTypeBaseUrl: BaseUrl;
  valueType: FilterValueType;
  value: FilterValue;
}

interface PropertyFilterWithoutValue {
  type: "Property";
  operator: PropertyOperatorWithoutValue;
  propertyTypeBaseUrl: BaseUrl;
  valueType?: never;
  value?: never;
}

export type PropertyFilter =
  | PropertyFilterWithValue
  | PropertyFilterWithoutValue;

export type FilterField = TypeFilter | PropertyFilter;

export type FormValues = {
  filters: FilterField[];
  operator: MultiFilterOperatorType;
};

export type QueryEntitiesFunc = (multiFilter: MultiFilter) => Promise<Entity[]>;
