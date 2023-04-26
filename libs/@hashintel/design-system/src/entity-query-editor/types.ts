import {
  BaseUrl,
  EntityType,
  MultiFilter,
  MultiFilterOperatorType,
  PropertyType,
} from "@blockprotocol/graph";
import { BoxProps } from "@mui/material";

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

interface PropertyFilterWithValue {
  type: "Property";
  operator: PropertyOperatorWithValue;
  propertyTypeBaseUrl: BaseUrl;
  value: string;
}

interface PropertyFilterWithoutValue {
  type: "Property";
  operator: PropertyOperatorWithoutValue;
  propertyTypeBaseUrl: BaseUrl;
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

export interface EntityQueryEditorProps {
  onSave: (value: MultiFilter) => void;
  onClose: () => void;
  sx?: BoxProps["sx"];
  entityTypes: EntityType[];
  propertyTypes: PropertyType[];
  defaultValue?: MultiFilter;
}
