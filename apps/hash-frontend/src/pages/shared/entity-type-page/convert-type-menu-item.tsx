import { ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import { useState } from "react";

import { AlertModal, LinkIcon } from "@hashintel/design-system";

import { MenuItem } from "../../../shared/ui/menu-item";
import { useContextBarActionsContext } from "../top-context-bar";

interface ConvertTypeMenuItemProps {
  convertToLinkType: () => void;
  disabled?: boolean;
  hasLinks: boolean;
  typeTitle: string;
}

export const ConvertTypeMenuItem = ({
  convertToLinkType,
  disabled,
  hasLinks,
  typeTitle,
}: ConvertTypeMenuItemProps) => {
  const { closeContextMenu } = useContextBarActionsContext();

  const [
    showConvertTypeConfirmationModal,
    setShowConvertTypeConfirmationModal,
  ] = useState(false);

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
            onClick={() => setShowConvertTypeConfirmationModal(true)}
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
      {showConvertTypeConfirmationModal && (
        <AlertModal
          callback={() => {
            convertToLinkType();
            closeContextMenu();
          }}
          calloutMessage={`A new version of this type will be created as a Link Type, and you won't be able to revert this change.${
            hasLinks ? " The links defined on this type will be removed." : ""
          }`}
          close={() => {
            setShowConvertTypeConfirmationModal(false);
            closeContextMenu();
          }}
          header={
            <>
              Convert <strong>{typeTitle}</strong> to link type
            </>
          }
          type="info"
        />
      )}
    </>
  );
};
