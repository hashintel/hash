import { PropertyType } from "@blockprotocol/type-system";
import { Chip } from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/ontology-types";

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
        label = "Array";
      }

      if (label) {
        return <Chip key={label} label={label} color="gray" />;
      }

      return null;
    })}
  </>
);
