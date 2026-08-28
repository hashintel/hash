import { use, useRef, useState } from "react";

import { Button, Icon, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SimulationContext } from "../../react/simulation/context";
import { ActiveNetContext } from "../../react/state/active-net-context";
import { SimulationControls } from "../views/Editor/components/BottomBar/simulation-controls";
import { SimulationScenarioControls } from "../views/shared/simulation-scenario-controls";

import type { PetrinautPreviewQuickSimulation } from "./quick-simulation";

const configurationPopoverStyle = css({
  width: "[min(380px, calc(100vw - 24px))]",
});

const configurationBodyStyle = css({
  height: "[min(420px, calc(100vh - 96px))]",
  minHeight: "[180px]",
  padding: "3",
});

const playbackPositionStyle = css({
  position: "absolute",
  left: "[50%]",
  bottom: "3",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
  transform: "translateX(-50%)",
  maxWidth: "[calc(100% - 24px)]",
  padding: "1",
  overflowX: "auto",
  borderWidth: "thin",
  borderColor: "neutral.a50",
  borderRadius: "xl",
  backgroundColor: "white.a95",
  boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.12)]",
});

const playbackControlsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[max-content]",
});

const configurationLabelStyle = css({
  "@media (max-width: 420px)": {
    display: "none",
  },
});

export const PreviewSimulationConfiguration = ({
  parameterBounds,
}: Pick<PetrinautPreviewQuickSimulation, "parameterBounds">) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        ref={triggerRef}
        size="xs"
        variant="ghost"
        prefix={<Icon name="play" size="xs" />}
        aria-label="Configure Quick Simulation"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className={configurationLabelStyle}>Quick Simulation</span>
      </Button>
      {open && (
        <Popover
          triggerRef={triggerRef}
          position="bottom-end"
          onClose={() => setOpen(false)}
        >
          <Popover.Container className={configurationPopoverStyle}>
            <Popover.Header title="Quick Simulation" />
            <Popover.Body className={configurationBodyStyle}>
              <SimulationScenarioControls
                allowNoScenario={false}
                parameterBounds={parameterBounds}
              />
            </Popover.Body>
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};

export const PreviewSimulationPlaybackControls = ({
  allowedPlaybackSpeeds,
}: Pick<PetrinautPreviewQuickSimulation, "allowedPlaybackSpeeds">) => {
  const { activeSubnetId } = use(ActiveNetContext);
  const { scenarioCompilationErrors } = use(SimulationContext);

  return (
    <div className={playbackPositionStyle}>
      <div className={playbackControlsStyle}>
        <SimulationControls
          allowedPlaybackSpeeds={
            allowedPlaybackSpeeds?.length ? allowedPlaybackSpeeds : undefined
          }
          disabled={scenarioCompilationErrors !== null}
          inSubnet={activeSubnetId !== null}
        />
      </div>
    </div>
  );
};
