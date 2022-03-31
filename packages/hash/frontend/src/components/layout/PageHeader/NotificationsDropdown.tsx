import { useState, useRef } from "react";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import { Box, ListItemButton, Typography, useTheme } from "@mui/material";

import { FontAwesomeIcon } from "../../icons";
import { Popover } from "../../Popover";
import { Link } from "../../Link";
import { HeaderIconButton } from "./HeaderIconButton";

export const NotificationsDropdown: React.FC = () => {
  const theme = useTheme();

  const buttonRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [notificationsLength] = useState(3);

  const hasNotifications = !!notificationsLength;

  const id = open ? "actions-popover" : undefined;

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
            hasNotifications || open
              ? theme.palette.common.white
              : theme.palette.gray[40],
          backgroundColor:
            hasNotifications || open
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
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        open={open}
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

      <Popover
        id={id}
        open={open}
        anchorEl={buttonRef.current}
        onClose={() => setOpen(false)}
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
        <Box>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                mx: 0.5,
                mt: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallTextLabels">Notification 1</Typography>
            </ListItemButton>
          </Link>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                mx: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallTextLabels">Notification 2</Typography>
            </ListItemButton>
          </Link>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                mx: 0.5,
                mb: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallTextLabels">Notification 3</Typography>
            </ListItemButton>
          </Link>
        </Box>
      </Popover>
    </Box>
  );
};
