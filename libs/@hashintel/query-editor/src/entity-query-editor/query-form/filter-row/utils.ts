import { faAsterisk, faDiagramSubtask } from "@hashintel/design-system";

import type { FilterType, PropertyOperator, TypeOperator } from "../../types";
import type { HashIconDefinition } from "@hashintel/design-system";

export const filterTypes: {
  type: FilterType;

  icon: HashIconDefinition["icon"];
}[] = [
  { type: "Type", icon: faAsterisk },
  { type: "Property", icon: faDiagramSubtask },
];

interface OperatorObject<T> {
  operator: T;
  hasValue: boolean;
}

const typeOperators: OperatorObject<TypeOperator>[] = [
  { operator: "is", hasValue: true },
];

const propertyOperators: OperatorObject<PropertyOperator>[] = [
  { operator: "is", hasValue: true },
  { operator: "is not", hasValue: true },
  { operator: "is empty", hasValue: false },
  { operator: "is not empty", hasValue: false },
  { operator: "contains", hasValue: true },
  { operator: "does not contain", hasValue: true },
];

export const fieldOperators: Record<
  FilterType,
  OperatorObject<TypeOperator | PropertyOperator>[]
> = {
  Property: propertyOperators,
  Type: typeOperators,
};
