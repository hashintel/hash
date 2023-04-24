import { MultiFilterOperatorType } from "@blockprotocol/graph";

export type FilterType = "Type" | "Property";

interface FilterBase {
  type: FilterType;
}

export type TypeOperator = "is";

interface TypeFilter extends FilterBase {
  type: "Type";
  operator: TypeOperator;
  value: string;
}

export type PropertyOperator =
  | "is"
  | "is not"
  | "is empty"
  | "is not empty"
  | "contains"
  | "does not contain";

interface PropertyFilter extends FilterBase {
  type: "Property";
  operator: PropertyOperator;
  value?: string;
  propertyTypeId: string;
}

export type FilterField = TypeFilter | PropertyFilter;

export type FormValues = {
  filters: FilterField[];
  operator: MultiFilterOperatorType;
};

export interface EntityQueryEditorProps {
  onSave: () => void;
  onClose: () => void;
}
