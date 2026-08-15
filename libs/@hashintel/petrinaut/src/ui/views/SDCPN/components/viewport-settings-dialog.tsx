import { use } from "react";

import { Button, Chip, Dialog, Select, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { isWebGpuAvailable } from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../react/state/user-settings-context";

import type { ArcRendering } from "../../../../react/state/user-settings-context";

/** Marks a setting as experimental; the shared style it used was removed. */
const badgeStyle = css({
  marginLeft: "1",
  paddingX: "1",
  paddingY: "[1px]",
  borderRadius: "sm",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  backgroundColor: "neutral.s10",
});

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
  display: "flex",
  alignItems: "center",
  gap: "[2]",
  flexWrap: "wrap",
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

const sectionTitleStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  letterSpacing: "wide",
  textTransform: "uppercase",
  color: "neutral.fg.subtle",
  marginTop: "4",
  marginBottom: "1",
  _first: {
    marginTop: "0",
  },
});

const selectStyle = css({
  width: "[160px]",
  flexShrink: "[0]",
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
    snapToGrid,
    setSnapToGrid,
    partialSelection,
    setPartialSelection,
    useEntitiesTreeView,
    setUseEntitiesTreeView,
    enableNetComponents,
    setEnableNetComponents,
    webGpuEnabled,
    setWebGpuEnabled,
    showCompilationOutput,
    setShowCompilationOutput,
  } = use(UserSettingsContext);
  const { extensions } = use(SDCPNContext);
  // Gated on runtime availability rather than a build flag, so the control is
  // only offered where it can actually do something.
  const webGpuAvailable = isWebGpuAvailable();

  if (!open) {
    return null;
  }

  const close = () => onOpenChange({ open: false });

  return (
    <Dialog onClose={close} size="xs">
      <Dialog.Header title="Settings" />
      <Dialog.Body>
        <h3 className={sectionTitleStyle}>Viewport</h3>
        <SettingRow
          label="Minimap"
          description="Show an overview minimap in the top-right corner"
        >
          <Toggle value={showMinimap} onChange={setShowMinimap} size="sm" />
        </SettingRow>
        <SettingRow
          label="Snap to grid"
          description="Snap node positions to the grid when placing or dragging"
        >
          <Toggle value={snapToGrid} onChange={setSnapToGrid} size="sm" />
        </SettingRow>
        <SettingRow label="Compact nodes">
          <Toggle value={compactNodes} onChange={setCompactNodes} size="sm" />
        </SettingRow>
        <SettingRow
          label="Partial selection"
          description="Select nodes that are only partially inside the selection box"
        >
          <Toggle
            value={partialSelection}
            onChange={setPartialSelection}
            size="sm"
          />
        </SettingRow>
        <SettingRow label="Arcs rendering">
          <Select
            size="sm"
            className={selectStyle}
            required
            value={arcRendering}
            onChange={(nextArcRendering) =>
              setArcRendering(nextArcRendering as ArcRendering)
            }
            items={[
              { value: "smoothstep", text: "Square" },
              { value: "bezier", text: "Bezier" },
              { value: "custom", text: "Adaptive Bezier" },
            ]}
          />
        </SettingRow>

        <h3 className={sectionTitleStyle}>General</h3>
        <SettingRow
          label="Animations"
          description="Animate panel transitions and UI interactions"
        >
          <Toggle
            value={showAnimations}
            onChange={setShowAnimations}
            size="sm"
          />
        </SettingRow>
        <SettingRow
          label="Keep panels mounted"
          description="Keep hidden panels loaded in the background for faster switching"
        >
          <Toggle
            value={keepPanelsMounted}
            onChange={setKeepPanelsMounted}
            size="sm"
          />
        </SettingRow>
        <SettingRow
          label={
            <>
              Entities tree view{" "}
              <Chip size="xs" color="orange" variant="outline" shape="round">
                Experimental
              </Chip>
            </>
          }
          description="Show a unified tree of all entities in the left sidebar"
        >
          <Toggle
            value={useEntitiesTreeView}
            onChange={setUseEntitiesTreeView}
            size="sm"
          />
        </SettingRow>
        {extensions.subnets && (
          <SettingRow
            label={
              <>
                Net Components{" "}
                <Chip size="xs" color="orange" variant="outline" shape="round">
                  Experimental
                </Chip>
              </>
            }
            description="Enable subnet definitions and component instances for hierarchical net composition"
          >
            <Toggle
              value={enableNetComponents}
              onChange={setEnableNetComponents}
              size="sm"
            />
          </SettingRow>
        )}
        <h3 className={sectionTitleStyle}>Simulation</h3>
        <SettingRow
          label={
            <>
              WebGPU <span className={badgeStyle}>Experimental</span>
            </>
          }
          description={
            webGpuAvailable
              ? "Offer a GPU option when creating an experiment. Each experiment then chooses its own backend, so GPU and CPU runs can go side by side. Much faster where the net qualifies, though results agree statistically rather than seed-for-seed."
              : "This browser does not expose WebGPU, so experiments run on the CPU."
          }
        >
          <Toggle
            value={webGpuEnabled && webGpuAvailable}
            onChange={setWebGpuEnabled}
            size="sm"
            disabled={!webGpuAvailable}
          />
        </SettingRow>
        <SettingRow
          label={
            <>
              Compilation output{" "}
              <span className={badgeStyle}>Experimental</span>
            </>
          }
          description="Add a Compilation tab to the bottom panel, showing how the net's code lowered to HIR and what stops it running on the GPU"
        >
          <Toggle
            value={showCompilationOutput}
            onChange={setShowCompilationOutput}
            size="sm"
          />
        </SettingRow>
      </Dialog.Body>
      <Dialog.Footer
        actions={
          <Button variant="solid" tone="neutral" size="sm" onClick={close}>
            Close
          </Button>
        }
      />
    </Dialog>
  );
};
