import { PropertyType } from "@blockprotocol/type-system";
import { Chip, FontAwesomeIcon } from "@local/design-system";
import { chipClasses } from "@mui/material";
import { Stack } from "@mui/system";

import { expectedValuesOptions } from "./shared/expected-values-options";
import { getArrayExpectedValueType } from "./shared/get-expected-value-descriptor";

export const PropertyExpectedValues = ({
  property,
}: {
  property: PropertyType;
}) => (
  <Stack direction="row" flexWrap="wrap" gap={1}>
    {property.oneOf.map((dataType, index) => {
      let expectedValueOption;

      if ("$ref" in dataType) {
        expectedValueOption = expectedValuesOptions[dataType.$ref];
      } else if (dataType.type === "array") {
        const childrenTypes = dataType.items.oneOf.map((item) =>
          "type" in item ? item.type : item.$ref,
        );

        const arrayType = getArrayExpectedValueType(childrenTypes);

        expectedValueOption = expectedValuesOptions[arrayType];
      }

      if (expectedValueOption) {
        return (
          <Chip
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            label={expectedValueOption.title}
            icon={
              <FontAwesomeIcon
                icon={{
                  icon: expectedValueOption.icon,
                }}
                sx={{ fontSize: "1em", mr: "1ch" }}
              />
            }
            color="gray"
            sx={{
              [`.${chipClasses.label}`]: {
                color: ({ palette }) => palette.gray[70],
              },
            }}
          />
        );
      }

      return null;
    })}
  </Stack>
);
