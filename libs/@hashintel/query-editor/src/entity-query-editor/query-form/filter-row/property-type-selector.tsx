import type { PropertyType } from "@blockprotocol/type-system/slim";
import { extractBaseUrl } from "@blockprotocol/type-system/slim";
import { MenuItem, OntologyChip } from "@hashintel/design-system";
import { FormControl, listClasses } from "@mui/material";
import { useMemo } from "react";
import type { FieldErrorsImpl } from "react-hook-form";
import { useFormContext } from "react-hook-form";

import { useReadonlyContext } from "../../readonly-context";
import type { FormValues, PropertyFilter } from "../../types";
import { RHFSelect } from "./rhf-select";

export const PropertyTypeSelector = ({
  index,
  propertyTypes,
}: {
  index: number;
  propertyTypes: PropertyType[];
}) => {
  const readonly = useReadonlyContext();
  const { control, formState, setValue } = useFormContext<FormValues>();

  const sortedPropertyTypes = useMemo(
    () => propertyTypes.sort((a, b) => a.title.localeCompare(b.title)),
    [propertyTypes],
  );

  const filterErrors = formState.errors.filters?.[index] as
    | FieldErrorsImpl<PropertyFilter>
    | undefined;

  const hasError = !!filterErrors?.propertyTypeBaseUrl;

  return (
    <FormControl>
      <RHFSelect
        control={control}
        rules={{
          required: "Required",
          onChange: (event: { target: { value: string } }) => {
            const chosenPropertyType = propertyTypes.find(
              (type) => extractBaseUrl(type.$id) === event.target.value,
            );

            const firstOneOf = chosenPropertyType?.oneOf[0];

            if (firstOneOf && "$ref" in firstOneOf) {
              const dataTypeId = firstOneOf.$ref;

              /** @todo temporary solution which works with mock data and only these 3 data types */
              setValue(
                `filters.${index}.valueType`,
                dataTypeId.includes("data-type/boolean/")
                  ? "boolean"
                  : dataTypeId.includes("data-type/number/")
                    ? "number"
                    : "string",
              );
            }
          },
        }}
        name={`filters.${index}.propertyTypeBaseUrl`}
        selectProps={{
          size: "xs",
          displayEmpty: true,
          error: hasError,
          disabled: readonly,
          MenuProps: {
            sx: {
              [`& .${listClasses.root}`]: {
                maxWidth: 600,
              },
            },
          },
        }}
      >
        <MenuItem disabled noSelectBackground>
          Choose
        </MenuItem>
        {sortedPropertyTypes.map(({ title, $id }) => {
          const baseUrl = extractBaseUrl($id);

          /**
           * @todo baseUrl is probably going to be duplicated if there are multiple versions of the same property type, which is going to make these items non-unique.
           * we need to address the versioning of property types here.
           */
          return (
            <MenuItem key={baseUrl} value={baseUrl}>
              {title}
              <OntologyChip
                domain={new URL($id).hostname}
                path={new URL($id).pathname}
                sx={{ marginLeft: 2 }}
              />
            </MenuItem>
          );
        })}
      </RHFSelect>
    </FormControl>
  );
};
