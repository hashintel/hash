import type { FlattenedCustomExpectedValueList } from "../../../shared/expected-value-types";
import type { BaseUrl } from "@blockprotocol/type-system";

export type ExpectedValueSelectorFormValues = {
  propertyTypeBaseUrl?: BaseUrl;
  customExpectedValueId?: string;
  editingExpectedValueIndex?: number;
  flattenedCustomExpectedValueList: FlattenedCustomExpectedValueList;
};
