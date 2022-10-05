import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import {
  IconButton,
  IconButtonProps,
} from "@hashintel/hash-design-system/icon-button";
import { Menu } from "@hashintel/hash-design-system/menu";
import { MenuItem } from "@hashintel/hash-design-system/menu-item";
import {
  Divider,
  ListItem,
  listItemClasses,
  ListItemText,
  listItemTextClasses,
  menuItemClasses,
  tableRowClasses,
  Typography,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { useId } from "react";
import { OntologyChip } from "./ontology-chip";
import { PlaceholderIcon } from "./placeholder-icon";

export const PropertyMenu = ({
  disabled,
  onRemove,
  ...props
}: IconButtonProps & { onRemove?: () => void }) => {
  const id = useId();
  const popupState = usePopupState({
    variant: "popover",
    popupId: `property-${id}`,
  });

  return (
    <>
      <IconButton
        {...props}
        disabled={disabled}
        sx={{
          opacity: 0,
          ...(!disabled && {
            [`.${tableRowClasses.root}:hover &`]: {
              opacity: 1,
            },
          }),
        }}
        {...bindTrigger(popupState)}
      >
        <FontAwesomeIcon
          icon={faEllipsis}
          sx={(theme) => ({
            fontSize: 14,
            color: theme.palette.gray[50],
          })}
        />
      </IconButton>
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
        sx={(theme) => ({
          [`.${listItemClasses.root}, .${menuItemClasses.root}`]: {
            px: 1.5,
            py: 1,
          },
          ".MuiTypography-smallCaps": {
            color: theme.palette.gray[50],
          },
          ".MuiTypography-microText": {
            color: theme.palette.gray[60],
          },
          [`.${listItemClasses.root}`]: {
            userSelect: "none",
            cursor: "default",
          },
          [`.${listItemTextClasses.root}`]: {
            m: 0,
          },
        })}
      >
        <Typography component={ListItem} variant="smallCaps">
          Actions
        </Typography>
        <MenuItem>
          <ListItemText primary="View property type" />
        </MenuItem>
        <MenuItem>
          <ListItemText primary="Edit property type" />
        </MenuItem>
        <MenuItem>
          <ListItemText primary="Copy link" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            popupState.close();
            onRemove?.();
          }}
        >
          <ListItemText primary="Remove property" />
        </MenuItem>
        <Divider />
        <Typography component={ListItem} variant="smallCaps">
          Source
        </Typography>
        <ListItem sx={{ pt: "0 !important" }}>
          <OntologyChip
            icon={<PlaceholderIcon />}
            domain="hash.ai"
            path={
              <>
                <Typography component="span" maxWidth="6ch">
                  @acme-corp
                </Typography>
                /
                <Typography component="span" maxWidth="5ch">
                  competitive-advantages
                </Typography>
              </>
            }
          />
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText
            primary="Version 3"
            primaryTypographyProps={{ variant: "microText", fontWeight: 500 }}
          />
        </ListItem>
      </Menu>
    </>
  );
};
