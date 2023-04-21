import { MultiFilterOperatorType } from "@blockprotocol/graph";

interface TypeFilter {
  type: "type";
  operator: "is";
  value: string;
}

interface PropertyFilter {
  type: "property";
  operator:
    | "is"
    | "is not"
    | "is empty"
    | "is not empty"
    | "contains"
    | "does not contain";
  value: string;
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
