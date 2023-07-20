import { Button } from "@hashintel/design-system";
import { Box, Tooltip } from "@mui/material";
import { usePopupState } from "material-ui-popup-state/hooks";

import { ConvertTypeConfirmationModal } from "./convert-type-button/convert-type-confirmation-modal";

interface ConvertTypeButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const ConvertTypeButton = ({
  onClick,
  loading,
  disabled,
}: ConvertTypeButtonProps) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: `convert-type-modal`,
  });

  const onOpen = () => {
    popupState.open();
  };

  return (
    <>
      <Tooltip
        title="Please publish or discard the current changes before converting to a Link Type."
        disableHoverListener={!disabled}
      >
        <Box>
          <Button
            variant="tertiary"
            onClick={onOpen}
            loading={loading}
            disabled={disabled}
          >
            Convert to Link Type
          </Button>
        </Box>
      </Tooltip>

      <ConvertTypeConfirmationModal
        popupState={popupState}
        onSubmit={onClick}
      />
    </>
  );
};
