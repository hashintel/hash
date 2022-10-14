import { PropertyType } from "@blockprotocol/type-system-web";
import { Chip } from "@hashintel/hash-design-system/chip";
import { types } from "@hashintel/hash-shared/types";

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
    {property.oneOf.map((type) => {
      if ("$ref" in type) {
        const label = dataTypeIdToTitle[type.$ref];

        if (label) {
          return <Chip key={label} label={label} color="gray" />;
        }
      }
      return null;
    })}
  </>
);
