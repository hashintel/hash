import { extractVersion, PropertyType } from "@blockprotocol/type-system";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  MenuItem,
} from "@hashintel/hash-design-system";
import {
  Divider,
  ListItem,
  listItemClasses,
  ListItemText,
  listItemTextClasses,
  Menu,
  menuItemClasses,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  PopupState,
} from "material-ui-popup-state/hooks";
import { Fragment } from "react";
import { MenuItemProps } from "../../../../shared/ui/menu-item";
import {
  OntologyChip,
  parseUriForOntologyChip,
} from "../../shared/ontology-chip";

export const PropertyMenu = ({
  editButtonProps,
  onRemove,
  property,
  popupState,
}: {
  editButtonProps: MenuItemProps;
  onRemove?: () => void;
  property: PropertyType;
  popupState: PopupState;
}) => {
  const version = extractVersion(property.$id);
  const ontology = parseUriForOntologyChip(property.$id);

  return (
    <>
      <IconButton {...bindTrigger(popupState)}>
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
        // We need the table's hover state to stay correct when this opens
        disablePortal
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

        <MenuItem
          {...editButtonProps}
          onClick={(evt) => {
            popupState.close();
            editButtonProps.onClick?.(evt);
          }}
          onTouchStart={(evt) => {
            popupState.close();
            editButtonProps.onTouchStart?.(evt);
          }}
        >
          <ListItemText primary="Edit property" />
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
          <Tooltip
            title={
              <>
                {ontology.domain}/{ontology.path}
              </>
            }
            placement="bottom"
          >
            <OntologyChip
              {...ontology}
              path={
                <>
                  {ontology.path.split("/").map((part, idx, parts) => {
                    const last = idx === parts.length - 1;
                    return (
                      // eslint-disable-next-line react/no-array-index-key
                      <Fragment key={idx}>
                        <Typography
                          component="span"
                          maxWidth={last ? "5ch" : "6ch"}
                        >
                          {part}
                        </Typography>
                        {last ? null : <>/</>}
                      </Fragment>
                    );
                  })}
                </>
              }
            />
          </Tooltip>
        </ListItem>
        <Divider />
        <ListItem>
          <ListItemText
            primary={<>Version {version}</>}
            primaryTypographyProps={{ variant: "microText", fontWeight: 500 }}
          />
        </ListItem>
      </Menu>
    </>
  );
};
