import { Autocomplete, MenuItem } from "@hashintel/design-system";
import { Image } from "@local/hash-isomorphic-utils/system-types/shared";
import { OwnedById } from "@local/hash-subgraph";
import {
  autocompleteClasses,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";

import { LocalStorage } from "../../../../../../shared/storage";
import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  darkModePlaceholderColor,
} from "../../../../../shared/style-values";
import { Avatar } from "../../../shared/avatar";

type WebOption = {
  avatar?: Image | null;
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
  avatar,
  label,
  name,
}: Pick<WebOption, "avatar" | "label" | "name">) => {
  return (
    <Stack direction="row" alignItems="center">
      <Avatar avatar={avatar} name={name} size={20} />
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
      avatar: user.avatar,
      label: "My web",
      name: user.properties.preferredName ?? "?",
      value: user.webOwnedById,
    },
    ...user.orgs.map((org) => ({
      avatar: org.avatar,
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
      inputHeight={28}
      inputProps={{
        endAdornment: <div />,
        sx: ({ palette }) => ({
          height: 25,
          backgroundColor: active ? "inherit" : palette.gray[10],

          [`&.${outlinedInputClasses.root}`]: {
            padding: 0,
          },

          [`.${autocompleteClasses.input}`]: {
            p: "0 10px !important",
          },

          "@media (prefers-color-scheme: dark)": {
            background: darkModeInputBackgroundColor,

            [`.${outlinedInputClasses.notchedOutline}`]: {
              border: `1px solid ${darkModeBorderColor} !important`,
            },

            [`.${outlinedInputClasses.input}`]: {
              color: darkModeInputColor,

              "&::placeholder": {
                color: `${darkModePlaceholderColor} !important`,
              },
            },
          },
        }),
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
          sx={({ palette }) => ({
            minHeight: 0,
            p: 0,
            borderBottom: `1px solid ${palette.gray[20]}`,
            [`&.${autocompleteClasses.option}`]: {
              minHeight: 0,
              py: 0.5,
              px: 0.5,
            },
            "@media (prefers-color-scheme: dark)": {
              borderBottom: `1px solid ${darkModeBorderColor}`,

              "&:hover": {
                background: darkModeInputBackgroundColor,
              },

              [`&.${autocompleteClasses.option}`]: {
                borderRadius: 0,
                my: 0.25,

                [`&[aria-selected="true"]`]: {
                  backgroundColor: `${palette.primary.main} !important`,
                  color: palette.common.white,
                },

                "&.Mui-focused": {
                  backgroundColor: `${palette.common.black} !important`,

                  [`&[aria-selected="true"]`]: {
                    backgroundColor: `${palette.primary.main} !important`,
                  },
                },
              },
            },
          })}
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
