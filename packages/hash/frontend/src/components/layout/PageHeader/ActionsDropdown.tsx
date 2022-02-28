import { useState, useRef } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Button,
  ListItemButton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import { FontAwesomeSvgIcon } from "../../icons";
import { Popover } from "../../Popover";
import { Link } from "../../Link";

export const ActionsDropdown: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const buttonRef = useRef(null);

  const [open, setOpen] = useState(false);

  const id = open ? "actions-popover" : undefined;

  return (
    <Box>
      <Button
        sx={{
          mr: {
            xs: 1,
            md: 1.5,
          },
          width: "32px",
          height: "32px",
          borderRadius: "100%",
          color: open ? theme.palette.common.white : theme.palette.gray[40],
          backgroundColor: open
            ? theme.palette.blue["70"]
            : theme.palette.gray[20],
        }}
        ref={buttonRef}
        variant="icon"
        onClick={() => setOpen(!open)}
      >
        <FontAwesomeSvgIcon icon={faPlus} />
      </Button>

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
          ".MuiListItemButton-root:hover": {
            backgroundColor: theme.palette.blue["70"],
            ".MuiTypography-smallCopy": {
              color: theme.palette.common.white,
            },
            ".MuiTypography-smallSecondaryCopy": {
              color: theme.palette.blue[30],
            },
          },
        }}
      >
        <Box>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                padding: (theme) => theme.spacing(1, 2),
                mx: 0.5,
                mt: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallCopy">Create page</Typography>
              {!isMobile && (
                <Typography variant="smallSecondaryCopy">Opt + P</Typography>
              )}
            </ListItemButton>
          </Link>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                padding: (theme) => theme.spacing(1, 2),
                mx: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallCopy">Create entity</Typography>
              {!isMobile && (
                <Typography variant="smallSecondaryCopy">Opt + E</Typography>
              )}
            </ListItemButton>
          </Link>
          <Link noLinkStyle href="#" onClick={() => setOpen(false)}>
            <ListItemButton
              sx={{
                padding: (theme) => theme.spacing(1, 2),
                mx: 0.5,
                mb: 0.5,
                borderRadius: 1,
                lineHeight: 1,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="smallCopy">Create type</Typography>
              {!isMobile && (
                <Typography variant="smallSecondaryCopy">Opt + T</Typography>
              )}
            </ListItemButton>
          </Link>
        </Box>
      </Popover>
    </Box>
  );
};
