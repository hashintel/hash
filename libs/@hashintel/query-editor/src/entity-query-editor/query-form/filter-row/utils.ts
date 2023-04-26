import { MultiFilter } from "@blockprotocol/graph";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { faAsterisk, faDiagramSubtask } from "@hashintel/design-system";

import {
  FilterType,
  FormValues,
  PropertyFilter,
  PropertyOperator,
  TypeOperator,
} from "../../types";

export const filterTypes: {
  type: FilterType;

  icon: IconDefinition["icon"];
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

/** @todo confirm this function with backend */
export const mapFormValuesToMultiFilter = (data: FormValues): MultiFilter => {
  const filters: MultiFilter["filters"] = [];

  for (const filter of data.filters) {
    if (filter.type === "Type") {
      filters.push({
        operator: "EQUALS",
        value: filter.value,
        field: ["metadata", "entityTypeId"],
      });
    } else {
      const field = ["properties", filter.propertyTypeBaseUrl];

      switch (filter.operator) {
        case "is empty":
          filters.push({
            field,
            operator: "EQUALS",
            value: null,
          });
          break;

        case "is not empty":
          filters.push({
            field,
            operator: "DOES_NOT_EQUAL",
            value: null,
          });
          break;

        case "is":
          filters.push({
            field,
            operator: "EQUALS",
            value: filter.value,
          });
          break;

        case "is not":
          filters.push({
            field,
            operator: "DOES_NOT_EQUAL",
            value: filter.value,
          });
          break;

        case "contains":
          filters.push({
            field,
            operator: "CONTAINS_SEGMENT",
            value: filter.value,
          });
          break;

        case "does not contain":
          filters.push({
            field,
            operator: "DOES_NOT_CONTAIN_SEGMENT",
            value: filter.value,
          });
          break;

        default:
          break;
      }
    }
  }

  return { operator: data.operator, filters };
};

export const mapMultiFilterToFormValues = (
  multiFilter: MultiFilter,
): FormValues => {
  const filters: FormValues["filters"] = [];

  for (const filter of multiFilter.filters) {
    const isTargetingEntityTypeId =
      filter.field[0] === "metadata" && filter.field[1] === "entityTypeId";
    const isTargetingProperty = filter.field[0] === "properties";

    if (isTargetingEntityTypeId) {
      if (filter.operator === "EQUALS") {
        filters.push({
          type: "Type",
          operator: "is",
          value: filter.value as string,
        });
      }

      /** @todo what about targeting a nested property? */
    } else if (isTargetingProperty && filter.field[1]) {
      const propertyTypeBaseUrl = filter.field[1] as string;

      const isEmpty = filter.operator === "EQUALS" && filter.value === null;
      const isNotEmpty =
        filter.operator === "DOES_NOT_EQUAL" && filter.value === null;
      const isEquals = filter.operator === "EQUALS" && filter.value !== null;
      const isNotEquals =
        filter.operator === "DOES_NOT_EQUAL" && filter.value !== null;
      const isContains =
        filter.operator === "CONTAINS_SEGMENT" && filter.value !== null;
      const isNotContains =
        filter.operator === "DOES_NOT_CONTAIN_SEGMENT" && filter.value !== null;

      const repeating: Pick<PropertyFilter, "type" | "propertyTypeBaseUrl"> = {
        type: "Property",
        propertyTypeBaseUrl,
      };

      if (isEmpty || isNotEmpty) {
        filters.push({
          ...repeating,
          operator: isEmpty ? "is empty" : "is not empty",
        });
      } else if (isEquals || isNotEquals) {
        filters.push({
          ...repeating,
          operator: isEquals ? "is" : "is not",
          value: filter.value as string,
        });
      } else if (isContains || isNotContains) {
        filters.push({
          ...repeating,
          operator: isContains ? "contains" : "does not contain",
          value: filter.value as string,
        });
      }
    }
  }

  return { operator: multiFilter.operator, filters };
};
