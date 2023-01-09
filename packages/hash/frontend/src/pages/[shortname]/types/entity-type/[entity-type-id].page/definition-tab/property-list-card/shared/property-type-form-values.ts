import {
  ExpectedValue,
  FlattenedCustomExpectedValueList,
} from "./expected-value-types";

export type PropertyTypeFormValues = {
  name: string;
  description: string;
  expectedValues: ExpectedValue[];
  flattenedCustomExpectedValueList: FlattenedCustomExpectedValueList;
};
