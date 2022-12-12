import { extractVersion, PropertyType } from "@blockprotocol/type-system";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  MenuItem,
} from "@hashintel/hash-design-system";
import { VersionedUri } from "@hashintel/hash-subgraph";
import {
  Divider,
  iconButtonClasses,
  ListItem,
  listItemClasses,
  ListItemText,
  listItemTextClasses,
  Menu,
  menuItemClasses,
  TableCell,
  tableRowClasses,
  Tooltip,
  Typography,
} from "@mui/material";
import { Version } from "@ory/client";
import {
  bindMenu,
  bindTrigger,
  PopupState,
} from "material-ui-popup-state/hooks";
import { Fragment } from "react";
import { MenuItemProps } from "../../../../../../../shared/ui/menu-item";
import {
  OntologyChip,
  parseUriForOntologyChip,
} from "../../../../../shared/ontology-chip";

export const PROPERTY_MENU_CELL_WIDTH = 70;

export const PropertyMenuCell = ({
  typeId,
  editButtonProps,
  onRemove,
  popupState,
  description,
}: {
  typeId: VersionedUri;
  editButtonProps: MenuItemProps;
  onRemove?: () => void;
  popupState: PopupState;
  description: "property" | "link";
}) => {
  const version = extractVersion(typeId);
  const ontology = parseUriForOntologyChip(typeId);

  return (
    <TableCell
      sx={{
        [`.${iconButtonClasses.root}`]: {
          opacity: 0,
          [`.${tableRowClasses.root}:hover &`]: {
            opacity: 1,
          },
        },
      }}
    >
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
          <ListItemText primary={<>Edit {description}</>} />
        </MenuItem>
        <MenuItem
          onClick={() => {
            popupState.close();
            onRemove?.();
          }}
        >
          <ListItemText primary={<>Remove {description}</>} />
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
    </TableCell>
  );
};
