import { ReactNode } from "react";

type FilterOption<Value = string> = {
  icon?: ReactNode;
  label: ReactNode;
  value: Value;
  /**
   * The number of entities that match this filter option, with
   * the filter state applied from all other filter sections.
   */
  count?: number;
};

type MultipleChoiceFilterSectionDefinition<Value = string> = {
  heading: string;
  kind: "multiple-choice";
  options: (FilterOption<Value> & {
    checked: boolean;
  })[];
  onChange: (values: Value[]) => void;
};

type SingleChoiceFilterSectionDefinition<Value = string> = {
  heading: string;
  kind: "single-choice";
  options: FilterOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
};

export type FilterSectionDefinition<Value = any> =
  | SingleChoiceFilterSectionDefinition<Value>
  | MultipleChoiceFilterSectionDefinition<Value>;
