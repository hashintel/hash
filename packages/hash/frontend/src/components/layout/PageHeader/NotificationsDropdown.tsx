import { useState, useRef } from "react";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  IconButton,
  ListItemButton,
  Typography,
  useTheme,
} from "@mui/material";

import { FontAwesomeSvgIcon } from "../../icons";
import { Popover } from "../../Popover";
import { Link } from "../../Link";

export const NotificationsDropdown: React.FC = () => {
  const theme = useTheme();

  const buttonRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [notificationsLength] = useState(3);

  const hasNotifications = !!notificationsLength;

  const id = open ? "actions-popover" : undefined;

  return (
    <Box>
      <IconButton
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
        }}
        ref={buttonRef}
        onClick={() => setOpen(!open)}
      >
        <FontAwesomeSvgIcon icon={faBell} />
        {hasNotifications && (
          <Typography
            sx={{
              color: theme.palette.common.white,
              fontWeight: 600,
              lineHeight: 2,
            }}
            ml={0.5}
          >
            {notificationsLength}
          </Typography>
        )}
      </IconButton>

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
        sx={{
          ".MuiListItemButton-root": {
            ".MuiTypography-smallTextParagraphs": {
              fontWeight: 500,
              color: theme.palette.gray[80],
            },
            ".MuiTypography-microText": {
              fontWeight: 500,
              color: theme.palette.gray[50],
            },
          },
          ".MuiListItemButton-root:hover": {
            backgroundColor: theme.palette.blue["70"],
            ".MuiTypography-smallTextParagraphs": {
              color: theme.palette.common.white,
            },
            ".MuiTypography-microText": {
              color: theme.palette.blue[30],
            },
          },
        }}
      >
        <Box>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                padding: theme.spacing(1, 2),
                mx: 0.5,
                mt: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallTextParagraphs">
                Notification 1
              </Typography>
            </ListItemButton>
          </Link>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                padding: theme.spacing(1, 2),
                mx: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallTextParagraphs">
                Notification 2
              </Typography>
            </ListItemButton>
          </Link>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                padding: theme.spacing(1, 2),
                mx: 0.5,
                mb: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallTextParagraphs">
                Notification 3
              </Typography>
            </ListItemButton>
          </Link>
        </Box>
      </Popover>
    </Box>
  );
};
