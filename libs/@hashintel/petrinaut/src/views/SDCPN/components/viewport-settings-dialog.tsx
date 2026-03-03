import { css } from "@hashintel/ds-helpers/css";

import { Dialog } from "../../../components/dialog";

const placeholderStyle = css({
  fontSize: "[14px]",
  color: "[#8d8d8d]",
  lineHeight: "[1.25]",
  fontWeight: "medium",
});

const cancelButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  paddingX: "[12px]",
  paddingY: "[8px]",
  fontSize: "[14px]",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "[#484848]",
  backgroundColor: "[white]",
  border: "[1px solid rgba(0, 0, 0, 0.09)]",
  borderRadius: "[10px]",
  cursor: "pointer",
  transition: "[background-color 0.15s ease]",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.03)]",
  },
  _active: {
    backgroundColor: "[rgba(0, 0, 0, 0.06)]",
  },
});

const confirmButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  paddingX: "[12px]",
  paddingY: "[8px]",
  fontSize: "[14px]",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "[white]",
  backgroundColor: "[#484848]",
  border: "none",
  borderRadius: "[10px]",
  cursor: "pointer",
  transition: "[background-color 0.15s ease]",
  _hover: {
    backgroundColor: "[#3a3a3a]",
  },
  _active: {
    backgroundColor: "[#2e2e2e]",
  },
});

interface ViewportSettingsDialogProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
}

export const ViewportSettingsDialog: React.FC<ViewportSettingsDialogProps> = ({
  open,
  onOpenChange,
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Content>
      <Dialog.Card>
        <Dialog.Header>Settings</Dialog.Header>
        <Dialog.Body>
          <p className={placeholderStyle}>
            Settings coming soon — this dialog will contain user preferences and
            viewport settings.
          </p>
        </Dialog.Body>
      </Dialog.Card>
      <Dialog.Footer>
        <Dialog.CloseTrigger asChild>
          <button type="button" className={cancelButtonStyle}>
            Cancel
          </button>
        </Dialog.CloseTrigger>
        <button type="button" className={confirmButtonStyle}>
          Confirm
        </button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
);
