import type { ReactElement, useMemo } from "react";
import {
  AngleRightRegularIcon,
  Autocomplete,
  Avatar,
} from "@hashintel/design-system";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  autocompleteClasses,
  Box,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";

import { MenuItem } from "../../shared/ui/menu-item";

import { useAuthenticatedUser } from "./auth-info-context";
import { getImageUrlFromEntityProperties } from "./get-file-properties";

const RenderOptionContent = ({
  avatarComponent,
  label,
}: {
  avatarComponent: ReactElement;
  label: string;
}) => {
  return (
    <Stack direction={"row"} alignItems={"center"} py={0.2} px={0}>
      {avatarComponent}
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 400,
          ml: 1.1,
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
};

interface WebSelectorProps {
  avatarSize?: number;
  inputHeight: number;
  inputId?: string;
  selectedWebOwnedById?: OwnedById;
  setSelectedWebOwnedById: (ownedById: OwnedById) => void;
}

const optionPx = 1.5;

export const WebSelector = ({
  avatarSize,
  inputHeight,
  inputId,
  selectedWebOwnedById,
  setSelectedWebOwnedById,
}: WebSelectorProps) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const options = useMemo(() => {
    return [
      {
        avatarComponent: (
          <Avatar
            size={avatarSize ?? 26}
            title={authenticatedUser.displayName ?? "?"}
            src={
              authenticatedUser.hasAvatar
                ? getImageUrlFromEntityProperties(
                    authenticatedUser.hasAvatar.imageEntity.properties,
                  )
                : undefined
            }
          />
        ),
        label: "My web",
        value: authenticatedUser.accountId as OwnedById,
      },
      ...authenticatedUser.memberOf.map(
        ({ org: { accountGroupId, name, hasAvatar } }) => ({
          avatarComponent: (
            <Avatar
              size={avatarSize ?? 26}
              title={name}
              src={
                hasAvatar
                  ? getImageUrlFromEntityProperties(
                      hasAvatar.imageEntity.properties,
                    )
                  : undefined
              }
            />
          ),
          label: name,
          value: accountGroupId as OwnedById,
        }),
      ),
    ];
  }, [avatarSize, authenticatedUser]);

  const selectedWeb = options.find(
    (option) => option.value === selectedWebOwnedById,
  );

  return (
    <Autocomplete
      disableClearable
      autoFocus={false}
      id={inputId}
      inputHeight={inputHeight}
      multiple={false}
      options={options}
      value={selectedWeb}
      componentsProps={{
        paper: {
          sx: {
            p: 0.2,
          },
        },
        popper: { placement: "top" },
      }}
      inputProps={{
        endAdornment: (
          <AngleRightRegularIcon
            sx={{
              fill: ({ palette }) => palette.gray[50],
              fontSize: 16,
            }}
          />
        ),
        startAdornment: selectedWeb ? (
          <Box>{selectedWeb.avatarComponent}</Box>
        ) : undefined,
        sx: {
          [`&.${outlinedInputClasses.root}`]: {
            px: optionPx,
            pr: 0,
            py: 0,
          },
          [`.${autocompleteClasses.input}`]: {
            p: "0 8px !important",
            fontSize: 14,
            fontWeight: 400,
          },
          height: inputHeight,
        },
      }}
      renderOption={(props, option) => (
        <MenuItem
          {...props}
          key={option.value}
          value={option.value}
          sx={{
            [`&.${autocompleteClasses.option}`]: {
              px: optionPx - 0.5,
            },
          }}
        >
          <RenderOptionContent {...option} />
        </MenuItem>
      )}
      sx={{
        width: 150,
      }}
      onChange={(_event, option) => {
        setSelectedWebOwnedById(option.value);
      }}
    />
  );
};
