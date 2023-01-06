import { PropertyType } from "@blockprotocol/type-system";
import { Chip } from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/ontology-types";

import { expectedValuesOptions } from "./shared/expected-values-options";
import { getArrayExpectedValueType } from "./shared/get-expected-value-descriptor";

const dataTypeIdToTitle = Object.values(types.dataType).reduce<
  Record<string, string>
>((prev, dataType) => {
  const { dataTypeId, title } = dataType;

  return { ...prev, [dataTypeId]: title };
}, {});

// @todo handle this being too many
export const PropertyExpectedValues = ({
  property,
}: {
  property: PropertyType;
}) => (
  <>
    {property.oneOf.map((dataType) => {
      let label;

      if ("$ref" in dataType) {
        label = dataTypeIdToTitle[dataType.$ref];
      } else if (dataType.type === "array") {
        const childrenTypes = dataType.items.oneOf.map((item) =>
          "type" in item ? item.type : item.$ref,
        );

        const arrayType = getArrayExpectedValueType(childrenTypes);

        label = expectedValuesOptions[arrayType].title;
      }

      if (label) {
        return <Chip key={label} label={label} color="gray" />;
      }

      return null;
    })}
  </>
);
