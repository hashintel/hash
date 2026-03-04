import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { Dialog } from "../../../components/dialog";
import { Select } from "../../../components/select";
import { Switch } from "../../../components/switch";
import type { ArcRendering } from "../../../state/user-settings-context";
import { UserSettingsContext } from "../../../state/user-settings-context";

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  paddingY: "2",
});

const labelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1.25]",
  color: "neutral.fg.heading",
});

const selectWrapperStyle = css({
  width: "[120px]",
  flexShrink: "[0]",
});

const cancelButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  paddingX: "3",
  paddingY: "2",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "neutral.fg.body",
  backgroundColor: "neutral.s00",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "xl",
  cursor: "pointer",
  transition: "[background-color 0.15s ease]",
  _hover: {
    backgroundColor: "neutral.bg.min.active",
  },
  _active: {
    backgroundColor: "neutral.bg.surface",
  },
});

const confirmButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  paddingX: "3",
  paddingY: "2",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "neutral.s00",
  backgroundColor: "neutral.s115",
  border: "none",
  borderRadius: "xl",
  cursor: "pointer",
  transition: "[background-color 0.15s ease]",
  _hover: {
    backgroundColor: "neutral.s110",
  },
  _active: {
    backgroundColor: "neutral.s120",
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
    compactNodes,
    setCompactNodes,
    arcRendering,
    setArcRendering,
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
              <span className={labelStyle}>Compact nodes</span>
              <Switch
                checked={compactNodes}
                onCheckedChange={setCompactNodes}
              />
            </div>
            <div className={rowStyle}>
              <span className={labelStyle}>Arcs rendering</span>
              <div className={selectWrapperStyle}>
                <Select
                  value={arcRendering}
                  onValueChange={(value) =>
                    setArcRendering(value as ArcRendering)
                  }
                  options={[
                    { value: "smoothstep", label: "Square" },
                    { value: "bezier", label: "Bezier" },
                    { value: "custom", label: "Custom" },
                  ]}
                  portal={false}
                />
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
