import { PropertyType } from "@blockprotocol/type-system-web";
import { Chip } from "@hashintel/hash-design-system/chip";

const dataTypeNames = {
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1": "Text",
  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1":
    "Number",
  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1":
    "Boolean",
  "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1": "Null",
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1":
    "JSON Object",
} as Record<string, string>;

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
