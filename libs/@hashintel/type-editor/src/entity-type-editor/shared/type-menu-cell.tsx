import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  extractBaseUrl,
  extractVersion,
} from "@blockprotocol/type-system/slim";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import type { MenuItemProps } from "@hashintel/design-system";
import {
  faCheck,
  FontAwesomeIcon,
  IconButton,
  MenuItem,
  OntologyChip,
  parseUrlForOntologyChip,
} from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/theme";
import type { TooltipProps } from "@mui/material";
import {
  Box,
  Divider,
  iconButtonClasses,
  ListItem,
  listItemClasses,
  ListItemText,
  listItemTextClasses,
  Menu,
  menuItemClasses,
  styled,
  TableCell,
  tableRowClasses,
  Tooltip,
  tooltipClasses,
  Typography,
} from "@mui/material";
import clsx from "clsx";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import type { MouseEventHandler } from "react";
import { Fragment, useCallback, useId, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { EntityTypeEditorFormData } from "../../shared/form-types";
import { useIsReadonly } from "../../shared/read-only-context";

export const TYPE_MENU_CELL_WIDTH = 70;

const NoMaxWidthTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip
    {...props}
    classes={{ popper: clsx(className, fluidFontClassName) }}
  />
))({
  [`& .${tooltipClasses.tooltip}`]: {
    maxWidth: "none",
  },
});

export const TypeMenuCell = ({
  typeId,
  variant,
  editable = true,
  editButtonProps,
  onRemove,
  editButtonDisabled,
}: {
  typeId: VersionedUrl;
  variant: "property" | "link";
  editable?: boolean;
  editButtonDisabled?: string;
  editButtonProps?: MenuItemProps;
  onRemove?: () => void;
}) => {
  const version = extractVersion(typeId);
  const ontology = parseUrlForOntologyChip(typeId);

  const popupId = useId();
  const popupState = usePopupState({
    variant: "popover",
    popupId: `property-menu-${popupId}`,
  });

  const isReadonly = useIsReadonly();
  const canEdit = editable && !isReadonly;

  const { control } = useFormContext<EntityTypeEditorFormData>();

  const labelPropertyController = useController({
    control,
    name: "labelProperty",
  });
  const isLabelProperty =
    variant === "property" &&
    extractBaseUrl(typeId) === labelPropertyController.field.value;

  const EditButton = useCallback(
    () => (
      <MenuItem
        {...editButtonProps}
        disabled={!!editButtonDisabled}
        onClick={(evt) => {
          popupState.close();
          editButtonProps?.onClick?.(evt);
        }}
        onTouchStart={(evt) => {
          popupState.close();
          editButtonProps?.onTouchStart?.(evt);
        }}
      >
        <ListItemText primary={<>Edit {variant}</>} />
      </MenuItem>
    ),
    [editButtonDisabled, popupState, editButtonProps, variant],
  );

  const [hasCopied, setHasCopied] = useState<boolean>(false);
  const copyEntityTypeId = useCallback<MouseEventHandler>(
    (event) => {
      event.preventDefault();

      setHasCopied(true);
      return navigator.clipboard.writeText(typeId);
    },
    [typeId, setHasCopied],
  );

  const handleTooltipOpen = () => {
    setHasCopied(false);
  };

  return (
    <TableCell
      width={70}
      sx={{
        [`.${iconButtonClasses.root}`]: {
          opacity: 0,
          [`.${tableRowClasses.root}:hover > &`]: {
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
        {canEdit
          ? [
              <Typography
                key="actions"
                component={ListItem}
                variant="smallCaps"
              >
                Actions
              </Typography>,

              editButtonDisabled ? (
                <Tooltip
                  key="edit"
                  title={editButtonDisabled}
                  classes={{ popper: fluidFontClassName }}
                >
                  <Box>
                    <EditButton />
                  </Box>
                </Tooltip>
              ) : (
                <EditButton key="edit" />
              ),
              <MenuItem
                key="remove"
                onClick={() => {
                  popupState.close();
                  onRemove?.();
                }}
              >
                <ListItemText primary={<>Remove {variant}</>} />
              </MenuItem>,
              ...(variant === "property"
                ? [
                    <MenuItem
                      key="label-property"
                      onClick={() => {
                        popupState.close();
                        labelPropertyController.field.onChange(
                          isLabelProperty ? null : extractBaseUrl(typeId),
                        );
                      }}
                    >
                      <ListItemText
                        primary={
                          <>
                            {isLabelProperty ? "Unset" : "Set"} as entity label
                          </>
                        }
                      />
                    </MenuItem>,
                  ]
                : []),
              <Divider key="divider" />,
            ]
          : null}

        <Typography component={ListItem} variant="smallCaps">
          Source
        </Typography>
        <ListItem sx={{ pt: "0 !important" }}>
          <NoMaxWidthTooltip
            enterDelay={250}
            onOpen={handleTooltipOpen}
            title={
              <Typography
                sx={{
                  display: "block",
                  width: "100%",
                }}
                align="center"
                variant="smallTextLabels"
              >
                <FontAwesomeIcon
                  icon={{ icon: hasCopied ? faCheck : faCopy.icon }}
                  sx={{ mr: 1 }}
                />
                {hasCopied ? "Copied" : "Click to copy"}
              </Typography>
            }
            placement="bottom"
          >
            <Box onClick={copyEntityTypeId}>
              <OntologyChip
                {...ontology}
                sx={{
                  cursor: "pointer",
                }}
              />
            </Box>
          </NoMaxWidthTooltip>
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
