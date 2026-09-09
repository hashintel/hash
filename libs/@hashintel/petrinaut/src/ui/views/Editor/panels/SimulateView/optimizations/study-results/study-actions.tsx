/**
 * The footer of a study: Pause and Stop (connected) or Cancel (remote) while
 * active; Resume and Run at the best configuration while paused; Continue,
 * Remove and Retry as a settled study allows; plus the switch to the other
 * presentation and, in the drawer, Close.
 */
import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import {
  isOptimizationActive,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../../react/optimizations/context";
import { ChartCardMenu } from "../../shared/chart-card";
import {
  ContinueControl,
  remainingOptimizationSteps,
} from "./continue-control";

import type { PetrinautSimulatePresentation } from "../../../../../../../react/state/editor-context";

/** The button that moves the navigation to the best step and computes there. */
const RefineBestButton = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { refineOptimizationBest } = use(OptimizationsContext);
  return (
    <Button
      variant="subtle"
      tone="neutral"
      size="sm"
      prefix={<Icon name="bullseye" size="sm" />}
      disabled={optimization.best === null}
      onClick={() => refineOptimizationBest(optimization.id)}
    >
      Run at the best configuration
    </Button>
  );
};

/**
 * The footer of a paused connected study: Resume (once the segment has
 * drained and the study is resumable), Run at the best configuration, and an
 * overflow menu holding Remove so it never sits beside the primary actions.
 */
const PausedStudyActions = ({
  optimization,
  onClose,
}: {
  optimization: OptimizationRecord;
  onClose?: () => void;
}) => {
  const { resumeOptimization, removeOptimization } = use(OptimizationsContext);
  const owed = optimization.requestedTrials - optimization.trials.length;
  const resumable = (optimization.connected?.resumable ?? false) && owed > 0;
  return (
    <>
      <ChartCardMenu
        label="More actions"
        items={[
          {
            id: "remove",
            text: "Remove",
            onClick: () => {
              removeOptimization(optimization.id);
              onClose?.();
            },
          },
        ]}
      />
      <RefineBestButton optimization={optimization} />
      <Button
        variant="solid"
        tone="neutral"
        size="sm"
        prefix={<Icon name="play" size="sm" />}
        disabled={!resumable}
        onClick={() => {
          void resumeOptimization(optimization.id).catch(() => undefined);
        }}
      >
        Resume
      </Button>
    </>
  );
};

/**
 * `onClose` is called when the surface should leave the record: after
 * Remove, and from the drawer's Close button.
 */
export const StudyActions = ({
  optimization,
  presentation,
  onPresentationChange,
  onClose,
}: {
  optimization: OptimizationRecord;
  presentation: PetrinautSimulatePresentation;
  onPresentationChange: (presentation: PetrinautSimulatePresentation) => void;
  onClose?: () => void;
}) => {
  const {
    cancelOptimization,
    pauseOptimization,
    removeOptimization,
    extendOptimization,
    retryOptimization,
  } = use(OptimizationsContext);
  const active = isOptimizationActive(optimization);
  const paused = optimization.status === "paused";
  const { connected } = optimization;

  return (
    <>
      {presentation === "drawer" ? (
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          prefix={<Icon name="expand" size="sm" />}
          onClick={() => onPresentationChange("full")}
        >
          Open full view
        </Button>
      ) : (
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          prefix={<Icon name="collapse" size="sm" />}
          onClick={() => onPresentationChange("drawer")}
        >
          Show in drawer
        </Button>
      )}
      {paused ? (
        <PausedStudyActions optimization={optimization} onClose={onClose} />
      ) : null}
      {!active && !paused ? (
        <Button
          variant="subtle"
          tone="error"
          size="sm"
          prefix={<Icon name="trash" size="sm" />}
          onClick={() => {
            removeOptimization(optimization.id);
            onClose?.();
          }}
        >
          Remove
        </Button>
      ) : null}
      {!active && !paused && connected ? (
        <RefineBestButton optimization={optimization} />
      ) : null}
      {active ? (
        <Button
          variant={connected ? "ghost" : "subtle"}
          tone="neutral"
          size="sm"
          prefix={<Icon name="stop" size="sm" />}
          onClick={() => cancelOptimization(optimization.id)}
        >
          {connected ? "Stop" : "Cancel"}
        </Button>
      ) : null}
      {active && connected ? (
        <Button
          variant="solid"
          tone="neutral"
          size="sm"
          prefix={<Icon name="pause" size="sm" />}
          onClick={() => pauseOptimization(optimization.id)}
        >
          Pause
        </Button>
      ) : null}
      {connected?.resumable && !paused ? (
        <ContinueControl
          // Reset with the segment, so the count starts fresh after each
          // continuation.
          key={optimization.requestedTrials}
          defaultSteps={optimization.input.study.trials}
          remainingSteps={remainingOptimizationSteps(
            optimization.requestedTrials,
          )}
          onContinue={(steps) =>
            extendOptimization(optimization.id, steps).catch(() => undefined)
          }
        />
      ) : null}
      {optimization.status === "error" ? (
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          prefix={<Icon name="rotate" size="sm" />}
          // Retrying selects the new run, so the surface re-points at it and
          // shows the fresh attempt, as creating a run does. Closing here
          // would undo that selection.
          onClick={() => {
            void retryOptimization(optimization.id);
          }}
        >
          Retry
        </Button>
      ) : null}
      {presentation === "drawer" && onClose ? (
        <Button variant="solid" tone="neutral" size="sm" onClick={onClose}>
          Close
        </Button>
      ) : null}
    </>
  );
};
