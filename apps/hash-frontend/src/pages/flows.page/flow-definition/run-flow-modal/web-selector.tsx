import { Autocomplete, Avatar } from "@hashintel/design-system";
import type { OwnedById } from "@local/hash-subgraph";
import { Stack, Typography } from "@mui/material";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getImageUrlFromEntityProperties } from "../../../shared/get-image-url-from-properties";
import { MenuItem } from "../../../../shared/ui/menu-item";

const RenderOptionContent = ({
  avatarComponent,
  title,
}: {
  avatarComponent: ReactElement;
  title: string;
}) => {
  return (
    <Stack direction="row" alignItems="center">
      {avatarComponent}
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 500,
          ml: 1,
        }}
      >
        {title}
      </Typography>
    </Stack>
  );
};

type WebSelectorProps = {
  selectedWebOwnedById?: OwnedById;
  setSelectedWebOwnedById: (ownedById: OwnedById) => void;
};

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
            size={22}
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
        ownedById: authenticatedUser.accountId as OwnedById,
        title: "My web",
      },
      ...authenticatedUser.memberOf.map(
        ({ org: { accountGroupId, name, hasAvatar } }) => ({
          avatarComponent: (
            <Avatar
              size={22}
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
          ownedById: accountGroupId as OwnedById,
          title: name,
        }),
      ),
    ];
  }, [authenticatedUser]);

  const selectedWeb = options.find(
    (option) => option.ownedById === selectedWebOwnedById,
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
      inputProps={{
        endAdornment: <div />,
        startAdornment: selectedWeb ? selectedWeb.avatarComponent : undefined,
      }}
      multiple={false}
      onChange={(_event, option) => {
        setSelectedWebOwnedById(option.ownedById);
      }}
      options={options}
      renderOption={(props, option) => (
        <MenuItem {...props} key={option.ownedById} value={option.ownedById}>
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
