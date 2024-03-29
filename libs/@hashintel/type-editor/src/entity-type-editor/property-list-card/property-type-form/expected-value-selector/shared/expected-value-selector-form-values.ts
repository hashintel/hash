import type { BaseUrl } from "@blockprotocol/type-system/slim";

import type { FlattenedCustomExpectedValueList } from "../../../shared/expected-value-types";

export type ExpectedValueSelectorFormValues = {
  propertyTypeBaseUrl?: BaseUrl;
  customExpectedValueId?: string;
  editingExpectedValueIndex?: number;
  flattenedCustomExpectedValueList: FlattenedCustomExpectedValueList;
};
