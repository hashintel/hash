import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  formControlLabelClasses,
  Radio,
  RadioGroup,
  styled,
  Typography,
} from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

import { FilterSectionDefinition } from "./types";

const CheckboxFilter: FunctionComponent<{
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <FormControlLabel
    sx={{
      borderRadius: 16,
      color: ({ palette }) =>
        checked ? palette.common.black : palette.gray[70],
      marginX: 0,
      flexShrink: 0,
      gap: 2,
      marginBottom: 1,
      [`.${formControlLabelClasses.label}`]: {
        display: "flex",
        alignItems: "center",
        fontSize: 14,
        fontWeight: 500,
        svg: {
          fontSize: 14,
          marginRight: 1.25,
        },
      },
      transition: ({ transitions }) =>
        transitions.create(["background", "color"]),
      "&:hover": {
        background: ({ palette }) => palette.gray[10],
        color: ({ palette }) => palette.gray[90],
      },
    }}
    label={label}
    control={
      <Checkbox
        sx={{
          svg: {
            width: 18,
            height: 18,
          },
        }}
        checked={checked}
        onChange={({ target }) => onChange(target.checked)}
      />
    }
  />
);

const FilterSectionHeading = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[70],
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  marginBottom: theme.spacing(1.5),
}));

export const FilterSection: FunctionComponent<{
  filterSection: FilterSectionDefinition;
}> = ({ filterSection }) => (
  <Box>
    <FilterSectionHeading>Type</FilterSectionHeading>
    {filterSection.kind === "multiple-choice" ? (
      <Box display="flex" flexDirection="column">
        {filterSection.options.map(({ label, value, checked }) => (
          <CheckboxFilter
            key={value}
            label={label}
            checked={checked}
            onChange={(updatedChecked) => {
              const previousCheckedValues = filterSection.options
                .filter((option) => option.checked)
                .map((option) => option.value);

              filterSection.onChange(
                updatedChecked
                  ? [...previousCheckedValues, value]
                  : previousCheckedValues.filter(
                      (previousValue) => previousValue !== value,
                    ),
              );
            }}
          />
        ))}
      </Box>
    ) : (
      <FormControl>
        <RadioGroup
          value={filterSection.value}
          onChange={(event) => filterSection.onChange(event.target.value)}
        >
          {filterSection.options.map(({ value, label }) => {
            return (
              <FormControlLabel
                key={value}
                value={value}
                control={<Radio />}
                label={label}
                sx={{
                  marginX: 0,
                  marginBottom: 1,
                  color: ({ palette }) =>
                    filterSection.value === value
                      ? palette.common.black
                      : palette.gray[70],
                  [`.${formControlLabelClasses.label}`]: {
                    display: "flex",
                    alignItems: "center",
                    fontSize: 14,
                    marginLeft: 2,
                    fontWeight: 500,
                    svg: {
                      fontSize: 14,
                      marginRight: 1.25,
                    },
                  },
                  "&:hover": {
                    color: ({ palette }) => palette.gray[90],
                  },
                }}
              />
            );
          })}
        </RadioGroup>
      </FormControl>
    )}
  </Box>
);
