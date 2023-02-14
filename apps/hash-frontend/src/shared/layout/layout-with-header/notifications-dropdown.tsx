import { faBell } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, ListItemText, Menu, Typography, useTheme } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useState } from "react";

import { MenuItem } from "../../ui";
import { HeaderIconButton } from "./shared/header-icon-button";

export const NotificationsDropdown: FunctionComponent = () => {
  const theme = useTheme();
  const [notificationsLength] = useState(3);
  const hasNotifications = !!notificationsLength;
  const popupState = usePopupState({
    variant: "popover",
    popupId: "notifications-dropdown-menu",
  });

  return (
    <Box>
      <HeaderIconButton
        sx={{
          mr: {
            xs: 1,
            md: 1.5,
          },
          fontSize: theme.spacing(2),
          width: hasNotifications ? "auto" : "32px",
          px: hasNotifications ? 1.5 : "unset",
          height: "32px",
          borderRadius: hasNotifications ? 4 : "100%",
          color:
            hasNotifications || popupState.isOpen
              ? theme.palette.common.white
              : theme.palette.gray[40],
          backgroundColor:
            hasNotifications || popupState.isOpen
              ? theme.palette.blue["70"]
              : theme.palette.gray[20],

          "&:hover": {
            color: theme.palette.common.white,
            backgroundColor: theme.palette.blue["70"],
            ...(hasNotifications && {
              backgroundColor: theme.palette.blue[80],
              boxShadow: "unset",
            }),
          },

          "&:focus-visible:after": {
            borderRadius: hasNotifications ? 10 : "100%",
          },
        }}
        {...bindTrigger(popupState)}
      >
        <FontAwesomeIcon icon={faBell} />
        {hasNotifications && (
          <Typography
            sx={{
              color: theme.palette.common.white,
              fontWeight: 600,
              lineHeight: theme.spacing(2),
            }}
            ml={0.5}
          >
            {notificationsLength}
          </Typography>
        )}
      </HeaderIconButton>

      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          elevation: 4,
          sx: {
            width: 225,
            borderRadius: "6px",
            marginTop: 1,
            border: `1px solid ${theme.palette.gray["20"]}`,
          },
        }}
      >
        {["Notification 1", "Notification 2", "Notification 3"].map((item) => (
          <MenuItem key={item}>
            <ListItemText primary={item} />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};
