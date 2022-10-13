import { PropertyType } from "@blockprotocol/type-system-web";
import { Chip } from "@hashintel/hash-design-system/chip";
import { types } from "@hashintel/hash-shared/types";

// @todo handle this being too many
export const PropertyExpectedValues = ({
  property,
}: {
  property: PropertyType;
}) => (
  <>
    {property.oneOf.map((type) => {
      if ("$ref" in type) {
        const { title: label } =
          Object.values(types.dataType).find(
            ({ dataTypeId }) => dataTypeId === type.$ref,
          ) ?? {};

        if (label) {
          return <Chip key={label} label={label} color="gray" />;
        }
      }
      return null;
    })}
  </>
);
