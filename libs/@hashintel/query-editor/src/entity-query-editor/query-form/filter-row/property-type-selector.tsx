import { extractBaseUrl, PropertyType } from "@blockprotocol/graph";
import { MenuItem } from "@hashintel/design-system";
import { FormControl } from "@mui/material";
import { FieldErrorsImpl, useFormContext } from "react-hook-form";

import { FormValues, PropertyFilter } from "../../types";
import { RHFSelect } from "./rhf-select";

export const PropertyTypeSelector = ({
  index,
  propertyTypes,
}: {
  index: number;
  propertyTypes: PropertyType[];
}) => {
  const { control, formState } = useFormContext<FormValues>();

  const filterErrors = formState.errors.filters?.[index] as
    | FieldErrorsImpl<PropertyFilter>
    | undefined;

  const hasError = !!filterErrors?.propertyTypeBaseUrl;

  return (
    <FormControl>
      <RHFSelect
        control={control}
        rules={{ required: "Required" }}
        name={`filters.${index}.propertyTypeBaseUrl`}
        selectProps={{
          size: "xs",
          displayEmpty: true,
          error: hasError,
        }}
      >
        <MenuItem disabled noSelectBackground>
          Choose
        </MenuItem>
        {propertyTypes.map(({ title, $id }) => {
          const baseUrl = extractBaseUrl($id);

          /**
           * @todo baseUrl is probably going to be duplicated if there are multiple versions of the same property type, which is going to make these items non-unique.
           * we need to address the versioning of property types here.
           */
          return (
            <MenuItem key={baseUrl} value={baseUrl}>
              {title}
            </MenuItem>
          );
        })}
      </RHFSelect>
    </FormControl>
  );
};
