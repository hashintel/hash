import { Button, MenuItem } from "@hashintel/design-system";
import { Tooltip } from "@mui/material";
import { usePopupState } from "material-ui-popup-state/hooks";

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
      <MenuItem onClick={openConvertTypeModel} disabled={disabled} title="Test">
        Convert to Link Type
      </MenuItem>

      <ConvertTypeConfirmationModal
        popupState={popupState}
        onSubmit={convertToLinkType}
      />
    </>
  );
};
