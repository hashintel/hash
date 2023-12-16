import {
  Autocomplete,
  EntityTypeIcon,
  MenuItem,
} from "@hashintel/design-system";
import { Stack, SvgIconProps, SxProps, Theme, Typography } from "@mui/material";
import { FunctionComponent } from "react";

import { LocalStorage } from "../../../../../../shared/storage";
import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
} from "../../../../../shared/style-values";
import { inputPropsSx, menuItemSx } from "../../shared/autocomplete-sx";
import { GlobePointerIcon } from "./globe-pointer-icon";

type GroupingOption = {
  value: LocalStorage["automaticInferenceConfig"]["displayGroupedBy"];
  label: string;
  Icon: FunctionComponent<SvgIconProps>;
};

const groupingOptions: GroupingOption[] = [
  {
    value: "type",
    label: "Type",
    Icon: EntityTypeIcon,
  },
  {
    value: "location",
    label: "Location",
    Icon: GlobePointerIcon,
  },
];

type GroupingSelectorProps = {
  selectedGrouping: GroupingOption["value"];
  setSelectedGrouping: (model: GroupingOption["value"]) => void;
};

const iconSx: SxProps<Theme> = {
  fontSize: 18,
  fill: ({ palette }) => palette.gray[50],
};

const RenderOptionContent = ({
  Icon,
  label,
}: Pick<GroupingOption, "Icon" | "label">) => {
  return (
    <Stack direction="row" alignItems="center">
      <Icon sx={iconSx} />
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 500,
          ml: 1,
          "@media (prefers-color-scheme: dark)": {
            color: darkModeInputColor,
          },
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
};

const inputHeight = 35;

export const SelectGrouping = ({
  selectedGrouping,
  setSelectedGrouping,
}: GroupingSelectorProps) => {
  const selectedGroupingOption = groupingOptions.find(
    (option) => option.value === selectedGrouping,
  );

  const { Icon } = selectedGroupingOption ?? {};

  return (
    <Autocomplete
      autoFocus={false}
      componentsProps={{
        paper: {
          sx: {
            "@media (prefers-color-scheme: dark)": {
              background: darkModeInputBackgroundColor,
              borderColor: darkModeBorderColor,
            },
            p: 0.2,
          },
        },
        popper: { placement: "top" },
      }}
      disableClearable
      inputHeight={inputHeight}
      inputProps={{
        endAdornment: <div />,
        startAdornment: Icon && <Icon sx={iconSx} />,
        sx: inputPropsSx({ inputHeight }),
      }}
      multiple={false}
      onChange={(_event, option) => {
        setSelectedGrouping(option.value);
      }}
      options={groupingOptions}
      renderOption={(props, option) => (
        <MenuItem
          {...props}
          key={option.value}
          value={option.value}
          sx={menuItemSx}
        >
          <RenderOptionContent {...option} />
        </MenuItem>
      )}
      sx={{
        width: 130,
      }}
      value={selectedGroupingOption}
    />
  );
};
