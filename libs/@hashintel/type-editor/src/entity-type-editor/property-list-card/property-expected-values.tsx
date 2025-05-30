import type { PropertyType } from "@blockprotocol/type-system";
import { Chip, FontAwesomeIcon } from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/theme";
import { chipClasses, Tooltip } from "@mui/material";
import { Stack } from "@mui/system";

import { useCustomizationSettings } from "../../shared/customization-context";
import { useDataTypesOptions } from "../../shared/data-types-options-context";
import { usePropertyTypesOptions } from "../../shared/property-types-options-context";

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
  const propertyTypes = usePropertyTypesOptions();

  const { onNavigateToType } = useCustomizationSettings();

  const { getExpectedValueDisplay } = useDataTypesOptions();

  return (
    <Stack direction="row" flexWrap="wrap" gap="2px 8px">
      {property.oneOf.map((dataType, index) => {
        let expectedValueOption;

        if ("$ref" in dataType) {
          expectedValueOption = getExpectedValueDisplay(dataType.$ref);
        } else if (dataType.type === "array") {
          const childrenTypes = dataType.items.oneOf.map((item) =>
            "type" in item ? item.type : item.$ref,
          );

          expectedValueOption = getExpectedValueDisplay(childrenTypes);
        } else {
          const selected = selectedExpectedValueIndex === index;
          const childrenTitles = Object.values(dataType.properties)
            .map((prop) => {
              const $ref = "items" in prop ? prop.items.$ref : prop.$ref;

              return propertyTypes[$ref]?.schema.title;
            })
            .filter((title) => title !== undefined);

          return (
            <Tooltip
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              title={childrenTitles.join(", ")}
              placement="top"
              classes={{ popper: fluidFontClassName }}
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

        return (
          <Chip
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            label={expectedValueOption.title}
            onClick={() => {
              if (expectedValueOption.$id && onNavigateToType) {
                onNavigateToType("dataType", expectedValueOption.$id);
              }
            }}
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
      })}
    </Stack>
  );
};
