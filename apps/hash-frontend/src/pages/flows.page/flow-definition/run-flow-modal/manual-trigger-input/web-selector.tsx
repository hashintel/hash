import { Autocomplete, Avatar } from "@hashintel/design-system";
import type { OwnedById } from "@local/hash-subgraph";
import {
  autocompleteClasses,
  Box,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { MenuItem } from "../../../../../shared/ui/menu-item";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";
import { getImageUrlFromEntityProperties } from "../../../../shared/get-image-url-from-properties";
import { inputHeight } from "../shared/dimensions";

const RenderOptionContent = ({
  avatarComponent,
  label,
}: {
  avatarComponent: ReactElement;
  label: string;
}) => {
  return (
    <Stack direction="row" alignItems="center" py={0.5} px={0}>
      {avatarComponent}
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 500,
          ml: 1.2,
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
};

type WebSelectorProps = {
  selectedWebOwnedById?: OwnedById;
  setSelectedWebOwnedById: (ownedById: OwnedById) => void;
};

const optionPx = 2;

export const WebSelector = ({
  selectedWebOwnedById,
  setSelectedWebOwnedById,
}: WebSelectorProps) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const options = useMemo(() => {
    return [
      {
        avatarComponent: (
          <Avatar
            size={26}
            src={
              authenticatedUser.hasAvatar
                ? getImageUrlFromEntityProperties(
                    authenticatedUser.hasAvatar.imageEntity.properties,
                  )
                : undefined
            }
            title={authenticatedUser.displayName ?? "?"}
          />
        ),
        label: "My web",
        value: authenticatedUser.accountId as OwnedById,
      },
      ...authenticatedUser.memberOf.map(
        ({ org: { accountGroupId, name, hasAvatar } }) => ({
          avatarComponent: (
            <Avatar
              size={26}
              src={
                hasAvatar
                  ? getImageUrlFromEntityProperties(
                      hasAvatar.imageEntity.properties,
                    )
                  : undefined
              }
              title={name}
            />
          ),
          label: name,
          value: accountGroupId as OwnedById,
        }),
      ),
    ];
  }, [authenticatedUser]);

  const selectedWeb = options.find(
    (option) => option.value === selectedWebOwnedById,
  );

  return (
    <Autocomplete
      autoFocus={false}
      componentsProps={{
        paper: {
          sx: {
            p: 0.2,
          },
        },
        popper: { placement: "top" },
      }}
      disableClearable
      inputHeight={inputHeight}
      inputProps={{
        endAdornment: <div />,
        startAdornment: selectedWeb ? (
          <Box mr={0.5}>{selectedWeb.avatarComponent}</Box>
        ) : undefined,
        sx: {
          [`&.${outlinedInputClasses.root}`]: {
            px: optionPx,
            py: 0,
          },
          height: inputHeight,
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
        width: 250,
      }}
      value={selectedWeb}
    />
  );
};
