import { ReactNode } from "react";

type MultipleChoiceFilterSectionDefinition<Value = any> = {
  heading: string;
  kind: "multiple-choice";
  options: {
    label: ReactNode;
    value: Value;
    checked: boolean;
    count?: number;
  }[];
  onChange: (values: Value[]) => void;
};

type SingleChoiceFilterSectionDefinition<Value = string> = {
  heading: string;
  kind: "single-choice";
  options: {
    label: ReactNode;
    value: Value;
    count?: number;
  }[];
  value: Value;
  onChange: (value: Value) => void;
};

export type FilterSectionDefinition<Value = any> =
  | SingleChoiceFilterSectionDefinition<Value>
  | MultipleChoiceFilterSectionDefinition<Value>;
