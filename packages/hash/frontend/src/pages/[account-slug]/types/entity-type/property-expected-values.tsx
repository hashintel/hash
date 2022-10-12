import { PropertyType } from "@blockprotocol/type-system-web";
import { Chip } from "@hashintel/hash-design-system/chip";
import { dataTypeNames } from "./use-property-types";

// @todo handle this being too many
export const PropertyExpectedValues = ({
  property,
}: {
  property: PropertyType;
}) => (
  <>
    {property.oneOf.map((type) => {
      if ("$ref" in type) {
        const label = dataTypeNames[type.$ref];
        if (label) {
          return <Chip key={label} label={label} color="gray" />;
        }
      }
      return null;
    })}
  </>
);
