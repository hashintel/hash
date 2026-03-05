import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { Button } from "../../../components/button";
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
          <Button
            variant="secondary"
            colorScheme="neutral"
            size="md"
            onClick={() => onOpenChange({ open: false })}
          >
            Cancel
          </Button>
          <Button
            colorScheme="neutral"
            size="md"
            onClick={() => onOpenChange({ open: false })}
          >
            Confirm
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
