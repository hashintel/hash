import { use, useRef, useState } from "react";

import { Button, Icon, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExecutionFrameSourceContext } from "../../react/execution-frame/context";
import { SimulationContext } from "../../react/simulation/context";
import { ActiveNetContext } from "../../react/state/active-net-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import { SimulationControls } from "../views/Editor/components/BottomBar/simulation-controls";
import { SimulationTimeline } from "../views/Editor/panels/BottomPanel/subviews/simulation-timeline/content";
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
  bottom: "2",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
  transform: "translateX(-50%)",
  // Hug the controls while collapsed; only an expanded timeline needs width.
  width: "[max-content]",
  maxWidth: "[calc(100% - 16px)]",
  // Lets supporting browsers animate the max-content <-> full-width switch.
  interpolateSize: "[allow-keywords]",
  padding: "0.5",
  overflow: "hidden",
  // A flat bordered box like the editor's panels: square, opaque, no shadow.
  borderWidth: "thin",
  borderColor: "neutral.s40",
  backgroundColor: "neutral.s00",
  "&[data-expanded='true']": {
    width: "[calc(100% - 16px)]",
    maxWidth: "[720px]",
  },
  "&[data-animated='true']": {
    transition: "[width 180ms ease-in-out, max-width 180ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
});

const playbackControlsScrollStyle = css({
  width: "full",
  minWidth: "0",
  overflowX: "auto",
});

const playbackControlsRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "1",
  width: "[max-content]",
  minWidth: "full",
});

const timelineRevealStyle = css({
  display: "grid",
  gridTemplateRows: "[0fr]",
  opacity: "0",
  pointerEvents: "none",
  "&[data-expanded='true']": {
    gridTemplateRows: "[1fr]",
    opacity: "1",
    pointerEvents: "auto",
  },
  "&[data-animated='true']": {
    transition:
      "[grid-template-rows 180ms ease-in-out, opacity 140ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
});

const timelineClipStyle = css({
  minHeight: "0",
  overflow: "hidden",
});

const timelineStyle = css({
  height: "[clamp(60px, 20vh, 116px)]",
  minHeight: "0",
  marginTop: "0.5",
  paddingTop: "0.5",
  borderTopWidth: "thin",
  borderColor: "neutral.bd.subtle",
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
  const { totalFrames } = use(ExecutionFrameSourceContext);
  const { showAnimations } = use(UserSettingsContext);
  const expanded = totalFrames > 0;

  return (
    <section
      aria-label="Simulation playback"
      className={playbackPositionStyle}
      data-animated={showAnimations}
      data-expanded={expanded}
      data-state={expanded ? "expanded" : "collapsed"}
    >
      <div className={playbackControlsScrollStyle}>
        <div className={playbackControlsRowStyle}>
          <SimulationControls
            allowedPlaybackSpeeds={
              allowedPlaybackSpeeds?.length ? allowedPlaybackSpeeds : undefined
            }
            disabled={scenarioCompilationErrors !== null}
            inSubnet={activeSubnetId !== null}
          />
        </div>
      </div>
      <div
        aria-hidden={!expanded}
        className={timelineRevealStyle}
        data-animated={showAnimations}
        data-expanded={expanded}
        data-preview-timeline=""
      >
        <div className={timelineClipStyle}>
          <div className={timelineStyle}>
            <SimulationTimeline showLegend={false} />
          </div>
        </div>
      </div>
    </section>
  );
};
