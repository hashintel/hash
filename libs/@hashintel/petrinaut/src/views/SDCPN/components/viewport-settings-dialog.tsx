import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { Dialog } from "../../../components/dialog";
import { Select } from "../../../components/select";
import { Switch } from "../../../components/switch";
import { UserSettingsContext } from "../../../state/user-settings-context";

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "[12px]",
  paddingY: "[8px]",
});

const labelStyle = css({
  fontSize: "[14px]",
  fontWeight: "medium",
  lineHeight: "[1.25]",
  color: "[#171717]",
});

const selectWrapperStyle = css({
  width: "[120px]",
  flexShrink: "[0]",
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
}) => {
  const {
    showAnimations,
    setShowAnimations,
    keepPanelsMounted,
    setKeepPanelsMounted,
  } = use(UserSettingsContext);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Card>
          <Dialog.Header>Settings</Dialog.Header>
          <Dialog.Body>
            <div className={rowStyle}>
              <span className={labelStyle}>Animations</span>
              <Switch
                checked={showAnimations}
                onCheckedChange={setShowAnimations}
              />
            </div>
            <div className={rowStyle}>
              <span className={labelStyle}>Keep panels mounted</span>
              <Switch
                checked={keepPanelsMounted}
                onCheckedChange={setKeepPanelsMounted}
              />
            </div>
            <div className={rowStyle}>
              <span className={labelStyle}>Modern nodes look</span>
              <Switch />
            </div>
            <div className={rowStyle}>
              <span className={labelStyle}>Arcs rendering</span>
              <div className={selectWrapperStyle}>
                <Select defaultValue="square">
                  <option value="square">Square</option>
                  <option value="bezier">Bezier</option>
                  <option value="modern">Modern</option>
                </Select>
              </div>
            </div>
          </Dialog.Body>
        </Dialog.Card>
        <Dialog.Footer>
          <Dialog.CloseTrigger asChild>
            <button type="button" className={cancelButtonStyle}>
              Cancel
            </button>
          </Dialog.CloseTrigger>
          <Dialog.CloseTrigger asChild>
            <button type="button" className={confirmButtonStyle}>
              Confirm
            </button>
          </Dialog.CloseTrigger>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
