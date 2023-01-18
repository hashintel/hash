import { PropertyType } from "@blockprotocol/type-system";
import { Chip, FontAwesomeIcon } from "@local/design-system";
import { chipClasses, Tooltip } from "@mui/material";
import { Stack } from "@mui/system";

import { usePropertyTypes } from "../../shared/property-types-context";
import { expectedValuesOptions } from "./shared/expected-values-options";
import { getArrayExpectedValueType } from "./shared/get-expected-value-descriptor";

export const PropertyExpectedValues = ({
  property,
  selectedExpectedValueIndex,
  setSelectedExpectedValueIndex,
  setAnimatingOutExpectedValue,
}: {
  property: PropertyType;
  selectedExpectedValueIndex: number;
  setSelectedExpectedValueIndex: (expectedValue: number) => void;
  setAnimatingOutExpectedValue: (value: boolean) => void;
}) => {
  const propertyTypes = usePropertyTypes();

  return (
    <Stack direction="row" flexWrap="wrap" gap="2px 8px">
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
        } else {
          const selected = selectedExpectedValueIndex === index;
          const childrenTitles = propertyTypes
            ? Object.values(dataType.properties)
                .map((prop) => {
                  const $ref = "items" in prop ? prop.items.$ref : prop.$ref;

                  return propertyTypes[$ref]?.title;
                })
                .filter((title) => title !== undefined)
            : [];

          return (
            <Tooltip
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              title={childrenTitles.join(", ")}
              placement="top"
            >
              <Chip
                onClick={() => {
                  setAnimatingOutExpectedValue(true);

                  setTimeout(
                    () => {
                      setSelectedExpectedValueIndex(selected ? -1 : index);
                      setAnimatingOutExpectedValue(false);
                    },
                    selectedExpectedValueIndex >= 0 ? 300 : 0,
                  );
                }}
                label={`${childrenTitles.length} nested properties`}
                variant="outlined"
                sx={({ palette }) => ({
                  backgroundColor: selected ? palette.gray[20] : "transparent",
                  [`.${chipClasses.label}`]: {
                    color: selected ? palette.gray[70] : palette.gray[60],
                  },
                })}
              />
            </Tooltip>
          );
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
};
