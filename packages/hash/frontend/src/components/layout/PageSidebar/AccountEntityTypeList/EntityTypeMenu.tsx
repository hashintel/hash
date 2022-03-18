import { useRef, useState, VFC } from "react";
import {
  faEllipsis,
  faLink,
  faAdd,
  faBookmark,
  faTrash,
  faFilter,
} from "@fortawesome/free-solid-svg-icons";
import pluralize from "pluralize";
import { Box, ListItemButton, Typography } from "@mui/material";
import { FontAwesomeIcon } from "../../../icons";
import { Popover } from "../../../Popover";
import { Link } from "../../../Link";
import { IconButton } from "../../../IconButton";

type EntityTypeMenuProps = {
  className: string;
};

const navItems = [
  {
    title: "Add to Bookmarks",
    icon: faBookmark, // @todo-mui get a free icon that matches the design closely
    onClick: () => {},
  },
  {
    title: `Create new ${pluralize.singular("People")}`,
    icon: faAdd,
    href: "/",
  },
  {
    title: "Copy Link to People",
    icon: faLink,
    onClick: () => {},
  },
  {
    title: "Create filtered page",
    icon: faFilter, // @todo-mui get a free icon that matches the design closely
    onClick: () => {},
  },
  {
    title: "Delete type",
    icon: faTrash,
    onClick: () => {},
  },
];

export const EntityTypeMenu: VFC<EntityTypeMenuProps> = ({ className }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <Box className={className}>
      <IconButton
        size="medium"
        unpadded
        ref={buttonRef}
        onClick={() => {
          // setOpen(true)
        }}
        sx={{
          backgroundColor: ({ palette }) => palette.gray[30],
          color: ({ palette }) => palette.gray[70],
        }}
      >
        <FontAwesomeIcon icon={faEllipsis} />
      </IconButton>
      {/* @todo-mui switch to using a menu instead */}
      <Popover
        open={open}
        anchorEl={buttonRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        PaperProps={{
          elevation: 4,
          sx: {
            width: 235,
            borderRadius: "6px",
            mt: 1,
          },
        }}
      >
        <Box
          sx={{
            py: 0.5,
          }}
        >
          {navItems.map(({ title, icon, onClick, href }) => {
            // const lastItem = index === navItems.length - 1;

            if (href) {
              return (
                <Link noLinkStyle href={href}>
                  <ListItemButton onClick={() => setOpen(false)}>
                    <FontAwesomeIcon icon={icon} />
                    <Typography variant="smallTextLabels">{title}</Typography>
                  </ListItemButton>
                </Link>
              );
            }
            if (onClick) {
              return (
                <ListItemButton
                  onClick={() => {
                    onClick();
                    setOpen(false);
                  }}
                  sx={{
                    mx: 0.5,
                    py: 1,
                    px: 1.5,
                    borderRadius: "4px",

                    "& svg": {
                      fontSize: 16,
                      mr: 0.75,
                      color: ({ palette }) => palette.gray[50],
                    },

                    "& .MuiTypography-root": {
                      color: ({ palette }) => palette.gray[80],
                      fontWeight: 500,
                    },

                    "&:hover": {
                      backgroundColor: ({ palette }) => palette.gray[20],

                      "& svg": {
                        color: ({ palette }) => palette.gray[60],
                      },
                    },

                    "&:focus-visible": {
                      backgroundColor: ({ palette }) => palette.blue[70],
                    },
                  }}
                >
                  <FontAwesomeIcon icon={icon} />
                  <Typography variant="smallTextLabels">{title}</Typography>
                </ListItemButton>
              );
            }
            return null;
          })}
        </Box>
      </Popover>
    </Box>
  );
};
