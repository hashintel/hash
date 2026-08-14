import { type ItemOrGroup } from "../Menu/SelectableList/selectable-list";

import type { FormInputSize } from "../../util/form-shared";
import type { FilterValue, FilterChange, InputFor } from "./filter-util";

type Operator<ValueMap extends Record<string, unknown>> = {
  [Key in keyof ValueMap & string]: {
    key: Key;
    label: string;
    input: InputFor<ValueMap[Key]>;
    onChange: (value: ValueMap[Key] | null) => void;
    tooltip?: string | React.ReactNode;
  };
}[keyof ValueMap & string];

/**
 * `ValueMap` is hand-passed and maps each operator key to the value type its input produces, e.g.
 * `<Filter<{ contains: string; between: [string, number]; empty: null }>>`.
 */
export const Filter = <
  ValueMap extends Record<string, unknown> = Record<string, unknown>,
>(_props: {
  className?: string;
  property: string;
  propertyLabel: string;
  operators: ItemOrGroup<Operator<ValueMap>>[];
  value?: FilterValue<ValueMap> | null;
  onChange: (...change: FilterChange<ValueMap>) => void;
  errors?: string[];
  disabled?: boolean;
  testId?: string;
  /** The size (height) of the element */
  size?: FormInputSize;
}) => {
  return <div />;
};
