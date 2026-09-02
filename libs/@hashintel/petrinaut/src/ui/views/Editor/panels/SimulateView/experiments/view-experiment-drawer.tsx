import { use } from "react";

import { Button, Drawer, Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  ExperimentsActionsContext,
  type ExperimentRecord,
} from "../../../../../../react/experiments/context";
import { Section, SectionList } from "../../../../../components/section";
import { SweepNavigator } from "./sweep-navigator";
import { SweepSurface } from "./sweep-surface";
import { ExperimentMetrics } from "./view-experiment-drawer/experiment-metrics";
import { ExperimentSummary } from "./view-experiment-drawer/experiment-summary";

// Local rather than the design system's `Badge`, whose `brand` scheme puts
// #5EB1EF on a near-white #FBFDFF — about 2.3:1, below the 4.5:1 WCAG AA
// needs for text this size.
const backendBadgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  paddingX: "1.5",
  paddingY: "[2px]",
  borderRadius: "sm",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  backgroundColor: "neutral.s10",
  "&[data-tone=active]": {
    color: "blue.s100",
    backgroundColor: "blue.s10",
  },
});

// The drawer body is a column: the summary, the navigator, and the surface
// hold still at the top, and the metric charts alone scroll below them.
const drawerBodyStyle = css({
  paddingTop: "[0]",
  display: "flex",
  flexDirection: "column",
});

const fixedSectionStyle = css({
  flexShrink: "0",
});

const metricsScrollStyle = css({
  flex: "[1]",
  minHeight: "[160px]",
  overflowY: "auto",
  scrollbarWidth: "[thin]",
});

const describeComputeBackend = (experiment: ExperimentRecord): string => {
  if (experiment.computeBackend === "webgpu") {
    return "Stepped on the GPU through WebGPU. Distributions match the CPU backend statistically; individual trajectories differ (different random generators).";
  }
  if (experiment.computeBackendFallbackReason !== null) {
    // The notification that carried this is gone by the time anyone wonders
    // why the results are not GPU-backed.
    return `The GPU backend was requested but could not run this net: ${experiment.computeBackendFallbackReason}`;
  }
  return "Stepped on the CPU, across worker threads.";
};

// Keeps its footprint when a run can no longer be cancelled, so Remove and
// Close do not slide when a run finishes.
const cancelSlotStyle = css({
  display: "inline-flex",
  "&[data-hidden=true]": { visibility: "hidden" },
});

const ComputeBackendBadge = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const isGpu = experiment.computeBackend === "webgpu";

  return (
    <Tooltip content={describeComputeBackend(experiment)} position="bottom-end">
      <span
        className={backendBadgeStyle}
        data-tone={isGpu ? "active" : "neutral"}
      >
        {isGpu ? <Icon name="lightning" size="xs" /> : null}
        {isGpu ? "GPU" : "CPU"}
      </span>
    </Tooltip>
  );
};

export const ViewExperimentDrawer = ({
  open,
  onClose,
  experiment,
}: {
  open: boolean;
  onClose: () => void;
  experiment: ExperimentRecord | undefined;
}) => {
  const { cancelExperiment, removeExperiment, setSweepSelection } = use(
    ExperimentsActionsContext,
  );

  if (!open || !experiment) {
    return null;
  }

  const canCancel =
    experiment.status === "initializing" || experiment.status === "running";

  return (
    <Drawer
      size="xl"
      showBackdrop={false}
      onClose={onClose}
      swapKey="experiment"
    >
      <Drawer.Header
        title={experiment.name}
        description={`${experiment.scenarioName ?? "Default scenario"} · ${experiment.runCount.toLocaleString("en-US")} runs · dt ${experiment.dt}`}
      />
      <Drawer.Body className={drawerBodyStyle}>
        <SectionList>
          <Section
            title="Summary"
            collapsible
            defaultOpen
            className={fixedSectionStyle}
            // In the header rather than the strip below, so which backend ran
            // stays visible when the section is collapsed.
            renderHeaderAction={() => (
              <ComputeBackendBadge experiment={experiment} />
            )}
          >
            <ExperimentSummary experiment={experiment} />
          </Section>
          {experiment.sweep ? (
            <Section
              title="Parameters"
              tooltip="Only the selected combination computes. Move a control and compute follows it; results for visited combinations are kept."
              className={fixedSectionStyle}
              // Not collapsible: the navigator stays usable while the charts
              // below stream.
              renderStickyBand={() =>
                experiment.sweep ? (
                  <SweepNavigator
                    axes={experiment.parameterAxes}
                    selection={experiment.sweep.selection}
                    status={{
                      computing: experiment.sweep.computing,
                      runsCompleted: experiment.sweep.runsCompleted,
                      runsSampled: experiment.sweep.runsSampled,
                      runTarget: experiment.sweep.runTarget,
                      runCount: experiment.runCount,
                    }}
                    onSelectionChange={(selection) =>
                      setSweepSelection(experiment.id, selection)
                    }
                  />
                ) : null
              }
            >
              {null}
            </Section>
          ) : null}
          {experiment.sweep && experiment.parameterAxes.length >= 2 ? (
            <Section
              title="Surface"
              tooltip="One metric's final value over two swept parameters, with every other parameter held at the middle of its range."
              collapsible
              defaultOpen
              className={fixedSectionStyle}
            >
              <SweepSurface experiment={experiment} />
            </Section>
          ) : null}
          {experiment.metricSpecs.length > 0 ? (
            <Section title="Metrics" fillHeight>
              <div className={metricsScrollStyle}>
                {/* Keyed so faded previous pictures and size choices never
                    leak from one experiment into another when the drawer
                    swaps records in place. */}
                <ExperimentMetrics
                  key={experiment.id}
                  experiment={experiment}
                />
              </div>
            </Section>
          ) : null}
        </SectionList>
      </Drawer.Body>
      <Drawer.Footer
        actions={
          <>
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              prefix={<Icon name="trash" size="sm" />}
              onClick={() => {
                removeExperiment(experiment.id);
                onClose();
              }}
            >
              Remove
            </Button>
            <span
              className={cancelSlotStyle}
              data-hidden={!canCancel}
              aria-hidden={!canCancel}
            >
              <Button
                variant="subtle"
                tone="neutral"
                size="sm"
                prefix={<Icon name="stop" size="sm" />}
                disabled={!canCancel}
                onClick={() => cancelExperiment(experiment.id)}
              >
                Cancel
              </Button>
            </span>
            <Button variant="solid" tone="neutral" size="sm" onClick={onClose}>
              Close
            </Button>
          </>
        }
      />
    </Drawer>
  );
};
