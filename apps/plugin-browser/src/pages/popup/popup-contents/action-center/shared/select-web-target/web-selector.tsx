import type { WebId } from "@blockprotocol/type-system";
import { Autocomplete, MenuItem } from "@hashintel/design-system";
import { Stack, Typography } from "@mui/material";
import type { ReactElement } from "react";

import type { LocalStorage } from "../../../../../../shared/storage";
import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
} from "../../../../../shared/style-values";
import { Avatar } from "../../../shared/avatar";
import { inputPropsSx, menuItemSx } from "../autocomplete-sx";

type WebOption = {
  avatarComponent: ReactElement;
  label: string;
  name: string;
  value: WebId;
};

type WebSelectorProps = {
  active: boolean;
  selectedWebWebId: WebId;
  setSelectedWebWebId: (webId: WebId) => void;
  user: NonNullable<LocalStorage["user"]>;
};

const RenderOptionContent = ({
  avatarComponent,
  label,
}: Pick<WebOption, "avatarComponent" | "label">) => {
  return (
    <Stack direction="row" alignItems="center">
      {avatarComponent}
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

const inputHeight = 30;

export const WebSelector = ({
  active,
  selectedWebWebId,
  setSelectedWebWebId,
  user,
}: WebSelectorProps) => {
  const options: WebOption[] = [
    {
      avatarComponent: (
        // Creating the component here reduces loading state in the dropdown
        <Avatar
          avatar={user.avatar}
          name={user.properties.displayName}
          size={16}
        />
      ),
      label: "My web",
      name: user.properties.displayName,
      value: user.webWebId,
    },
    ...user.orgs.map((org) => ({
      avatarComponent: (
        <Avatar
          avatar={org.avatar}
          name={org.properties.organizationName}
          size={16}
        />
      ),
      label: org.properties.organizationName,
      name: org.properties.organizationName,
      value: org.webWebId,
    })),
  ];

  const selectedWeb = options.find(
    (option) => option.value === selectedWebWebId,
  );

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
        startAdornment: selectedWeb?.avatarComponent,
        sx: {
          ...inputPropsSx({ inputHeight }),
          backgroundColor: ({ palette }) =>
            active ? "inherit" : palette.gray[10],
        },
      }}
      multiple={false}
      onChange={(_event, option) => {
        setSelectedWebWebId(option.value);
      }}
      options={options}
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
        width: 150,
      }}
      value={selectedWeb}
    />
  );
};
