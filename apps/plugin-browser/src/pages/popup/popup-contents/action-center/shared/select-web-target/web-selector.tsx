import { Autocomplete, MenuItem } from "@hashintel/design-system";
import { Image } from "@local/hash-isomorphic-utils/system-types/shared";
import { OwnedById } from "@local/hash-subgraph";
import { Stack, Typography } from "@mui/material";
import { ReactElement } from "react";
import { Simulate } from "react-dom/test-utils";

import { LocalStorage } from "../../../../../../shared/storage";
import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
} from "../../../../../shared/style-values";
import { Avatar } from "../../../shared/avatar";
import { inputHeight, inputPropsSx, menuItemSx } from "../autocomplete-sx";
import input = Simulate.input;

type WebOption = {
  avatarComponent: ReactElement;
  label: string;
  name: string;
  value: OwnedById;
};

type WebSelectorProps = {
  active: boolean;
  selectedWebOwnedById: OwnedById;
  setSelectedWebOwnedById: (ownedById: OwnedById) => void;
  user: NonNullable<LocalStorage["user"]>;
};

const RenderOptionContent = ({
  avatarComponent,
  label,
  name,
}: Pick<WebOption, "avatarComponent" | "label" | "name">) => {
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

export const WebSelector = ({
  active,
  selectedWebOwnedById,
  setSelectedWebOwnedById,
  user,
}: WebSelectorProps) => {
  const options: WebOption[] = [
    {
      avatarComponent: (
        // Creating the component here reduces loading state in the dropdown
        <Avatar
          avatar={user.avatar}
          name={user.properties.preferredName ?? "?"}
          size={16}
        />
      ),
      label: "My web",
      name: user.properties.preferredName ?? "?",
      value: user.webOwnedById,
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
      value: org.webOwnedById,
    })),
  ];

  const selectedWeb = options.find(
    (option) => option.value === selectedWebOwnedById,
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
          ...inputPropsSx,
          backgroundColor: ({ palette }) =>
            active ? "inherit" : palette.gray[10],
        },
      }}
      multiple={false}
      onChange={(_event, option) => {
        setSelectedWebOwnedById(option.value);
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
