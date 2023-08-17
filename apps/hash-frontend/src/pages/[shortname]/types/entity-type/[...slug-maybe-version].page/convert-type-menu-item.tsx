import { ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import { usePopupState } from "material-ui-popup-state/hooks";

import { LinkIcon } from "../../../../../shared/icons/link-icon";
import { MenuItem } from "../../../../../shared/ui/menu-item";
import { useContextBarActionsContext } from "../../../../shared/top-context-bar";
import { ConvertTypeConfirmationModal } from "./convert-type-button/convert-type-confirmation-modal";

interface ConvertTypeMenuItemProps {
  convertToLinkType: () => void;
  disabled?: boolean;
}

export const ConvertTypeMenuItem = ({
  convertToLinkType,
  disabled,
}: ConvertTypeMenuItemProps) => {
  const { closeContextMenu } = useContextBarActionsContext();

  const popupState = usePopupState({
    variant: "popover",
    popupId: `convert-type-modal`,
  });

  const openConvertTypeModel = () => {
    popupState.open();
  };

  return (
    <>
      <Tooltip
        title={
          disabled
            ? "Please save or discard your changes before converting the type"
            : ""
        }
      >
        {/* Tooltips don't work placed directly on MenuItems, a wrapping div is required */}
        <div>
          <MenuItem
            onClick={openConvertTypeModel}
            disabled={disabled}
            title="Test"
          >
            <ListItemIcon>
              <LinkIcon sx={{ fontSize: 16 }} />
            </ListItemIcon>
            <ListItemText>Convert to Link Type</ListItemText>
          </MenuItem>
        </div>
      </Tooltip>

      <ConvertTypeConfirmationModal
        onClose={() => {
          popupState.close();
          closeContextMenu();
        }}
        onSubmit={() => {
          convertToLinkType();
          closeContextMenu();
        }}
        popupState={popupState}
      />
    </>
  );
};
