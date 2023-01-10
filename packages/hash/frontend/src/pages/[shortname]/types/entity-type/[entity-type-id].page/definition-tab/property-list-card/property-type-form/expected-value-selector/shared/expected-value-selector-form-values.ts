import { FlattenedCustomExpectedValueList } from "../../../shared/expected-value-types";

export type ExpectedValueSelectorFormValues = {
  customExpectedValueId?: string;
  editingExpectedValueIndex?: number;
  flattenedCustomExpectedValueList: FlattenedCustomExpectedValueList;
};
