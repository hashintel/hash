import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { Button } from "../../../components/button";
import { Dialog } from "../../../components/dialog";
import { Select } from "../../../components/select";
import { Switch } from "../../../components/switch";
import type { ArcRendering } from "../../../state/user-settings-context";
import { UserSettingsContext } from "../../../state/user-settings-context";

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[1fr auto]",
  gridTemplateRows: "auto",
  columnGap: "8",
  rowGap: "1",
  alignItems: "center",
  paddingY: "2",
});

const labelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1.25]",
  color: "neutral.fg.heading",
  gridColumn: "1",
  gridRow: "1",
});

const controlStyle = css({
  gridColumn: "2",
  gridRow: "[1 / -1]",
  alignSelf: "center",
});

const descriptionStyle = css({
  fontSize: "xs",
  color: "neutral.fg.subtle",
  lineHeight: "[1.4]",
  gridColumn: "1",
  gridRow: "2",
});

const selectStyle = css({
  width: "[160px]",
  flexShrink: "[0]",
});

const badgeStyle = css({
  display: "inline-block",
  marginLeft: "1.5",
  px: "1.5",
  py: "0.5",
  fontSize: "[10px]",
  fontWeight: "semibold",
  lineHeight: "[1]",
  letterSpacing: "wide",
  textTransform: "uppercase",
  color: "neutral.s10",
  backgroundColor: "neutral.s100",
  borderRadius: "md",
  verticalAlign: "middle",
});

const SettingRow: React.FC<{
  label: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className={rowStyle}>
    <span className={labelStyle}>{label}</span>
    <div className={controlStyle}>{children}</div>
    {description && <p className={descriptionStyle}>{description}</p>}
  </div>
);

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
    showMinimap,
    setShowMinimap,
    partialSelection,
    setPartialSelection,
    useEntitiesTreeView,
    setUseEntitiesTreeView,
  } = use(UserSettingsContext);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Card>
          <Dialog.Header>Settings</Dialog.Header>
          <Dialog.Body>
            <SettingRow
              label="Animations"
              description="Animate panel transitions and UI interactions"
            >
              <Switch
                checked={showAnimations}
                onCheckedChange={setShowAnimations}
              />
            </SettingRow>
            <SettingRow
              label="Keep panels mounted"
              description="Keep hidden panels loaded in the background for faster switching"
            >
              <Switch
                checked={keepPanelsMounted}
                onCheckedChange={setKeepPanelsMounted}
              />
            </SettingRow>
            <SettingRow
              label="Minimap"
              description="Show an overview minimap in the top-right corner"
            >
              <Switch checked={showMinimap} onCheckedChange={setShowMinimap} />
            </SettingRow>
            <SettingRow label="Compact nodes">
              <Switch
                checked={compactNodes}
                onCheckedChange={setCompactNodes}
              />
            </SettingRow>
            <SettingRow
              label="Partial selection"
              description="Select nodes that are only partially inside the selection box"
            >
              <Switch
                checked={partialSelection}
                onCheckedChange={setPartialSelection}
              />
            </SettingRow>
            <SettingRow
              label={
                <>
                  Entities tree view{" "}
                  <span className={badgeStyle}>Experimental</span>
                </>
              }
              description="Show a unified tree of all entities in the left sidebar"
            >
              <Switch
                checked={useEntitiesTreeView}
                onCheckedChange={setUseEntitiesTreeView}
              />
            </SettingRow>
            <SettingRow label="Arcs rendering">
              <Select
                className={selectStyle}
                value={arcRendering}
                onValueChange={(value) =>
                  setArcRendering(value as ArcRendering)
                }
                options={[
                  { value: "smoothstep", label: "Square" },
                  { value: "bezier", label: "Bezier" },
                  { value: "custom", label: "Adaptive Bezier" },
                ]}
                portal={false}
              />
            </SettingRow>
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
