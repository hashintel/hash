import { css } from "@hashintel/ds-helpers/css";
import { use, useState } from "react";
import { LuLayers2 } from "react-icons/lu";
import { PiFlaskBold } from "react-icons/pi";
import { TbChartBar, TbPlus } from "react-icons/tb";

import { Button } from "../../../../components/button";
import type { SegmentOption } from "../../../../components/segment-group";
import { SegmentGroup } from "../../../../components/segment-group";
import { Stack } from "../../../../components/stack";
import type { Metric, Scenario } from "../../../../core/types/sdcpn";
import {
  EditorContext,
  type SimulateViewMode,
} from "../../../../state/editor-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { CreateExperimentDrawer } from "./create-experiment-drawer";
import { CreateMetricDrawer } from "./create-metric-drawer";
import { CreateScenarioDrawer } from "./create-scenario-drawer";
import { ViewMetricDrawer } from "./view-metric-drawer";
import { ViewScenarioDrawer } from "./view-scenario-drawer";

// -- Layout styles -------------------------------------------------------------

const containerStyle = css({
  display: "flex",
  flexDirection: "row",
  width: "full",
  height: "full",
});

const sidebarStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  padding: "[12px]",
  backgroundColor: "neutral.s00",
  borderRightWidth: "[1px]",
  borderRightStyle: "solid",
  borderRightColor: "neutral.s40",
  flexShrink: 0,
});

const mainContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "[0]",
  height: "full",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: "[52px]",
  paddingLeft: "[18px]",
  paddingRight: "[20px]",
  paddingY: "[12px]",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s40",
  flexShrink: 0,
});

const headerTitleStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

const contentStyle = css({
  flex: "1",
  display: "flex",
  flexDirection: "column",
  minHeight: "[0]",
  overflowY: "auto",
});

// -- Scenario list styles ------------------------------------------------------

const tableStyle = css({
  display: "flex",
  flexDirection: "column",
  width: "full",
});

const tableHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  paddingX: "[20px]",
  paddingY: "[8px]",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.a10",
  flexShrink: 0,
});

const tableHeaderCellStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
  textTransform: "uppercase",
  letterSpacing: "[0.05em]",
});

const nameColumnStyle = css({
  width: "[200px]",
  flexShrink: 0,
});

const descriptionColumnStyle = css({
  flex: "1",
  minWidth: "[0]",
});

const tableRowStyle = css({
  display: "flex",
  alignItems: "center",
  paddingX: "[20px]",
  paddingY: "[12px]",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.a10",
  cursor: "pointer",
  transition: "[background-color 0.1s ease]",
  background: "[none]",
  border: "[none]",
  width: "full",
  textAlign: "left",
  _hover: {
    backgroundColor: "neutral.bg.subtle.hover",
  },
});

const selectedRowStyle = css({
  backgroundColor: "neutral.bg.subtle.hover",
});

const scenarioNameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const scenarioDescriptionStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s80",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const emptyStateStyle = css({
  flex: "1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s80",
  fontSize: "sm",
});

// -- Mode options --------------------------------------------------------------

const modeOptions: SegmentOption[] = [
  {
    value: "scenarios",
    label: "Scenarios",
    icon: <LuLayers2 size={16} />,
    hideLabel: true,
    tooltip: "Scenarios",
  },
  {
    value: "metrics",
    label: "Metrics",
    icon: <TbChartBar size={16} />,
    hideLabel: true,
    tooltip: "Metrics",
  },
  {
    value: "experiments",
    label: "Experiments",
    icon: <PiFlaskBold size={16} />,
    hideLabel: true,
    tooltip: "Experiments not yet available",
    disabled: true,
  },
];

// -- Scenario list component ---------------------------------------------------

const ScenarioList = ({
  scenarios,
  selectedId,
  onSelect,
}: {
  scenarios: Scenario[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  if (scenarios.length === 0) {
    return <div className={emptyStateStyle}>No scenarios yet</div>;
  }

  return (
    <div className={tableStyle} role="table">
      <div className={tableHeaderStyle} role="row">
        <span className={`${tableHeaderCellStyle} ${nameColumnStyle}`}>
          Name
        </span>
        <span className={`${tableHeaderCellStyle} ${descriptionColumnStyle}`}>
          Description
        </span>
      </div>

      {scenarios.map((scenario) => (
        <button
          key={scenario.id}
          type="button"
          className={`${tableRowStyle}${scenario.id === selectedId ? ` ${selectedRowStyle}` : ""}`}
          onClick={() => onSelect(scenario.id)}
        >
          <div className={nameColumnStyle}>
            <span className={scenarioNameStyle}>{scenario.name}</span>
          </div>
          <div className={descriptionColumnStyle}>
            <span className={scenarioDescriptionStyle}>
              {scenario.description ?? ""}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
};

// -- Metric list component -----------------------------------------------------

const MetricList = ({
  metrics,
  selectedId,
  onSelect,
}: {
  metrics: Metric[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  if (metrics.length === 0) {
    return <div className={emptyStateStyle}>No metrics yet</div>;
  }

  return (
    <div className={tableStyle} role="table">
      <div className={tableHeaderStyle} role="row">
        <span className={`${tableHeaderCellStyle} ${nameColumnStyle}`}>
          Name
        </span>
        <span className={`${tableHeaderCellStyle} ${descriptionColumnStyle}`}>
          Description
        </span>
      </div>

      {metrics.map((metric) => (
        <button
          key={metric.id}
          type="button"
          className={`${tableRowStyle}${metric.id === selectedId ? ` ${selectedRowStyle}` : ""}`}
          onClick={() => onSelect(metric.id)}
        >
          <div className={nameColumnStyle}>
            <span className={scenarioNameStyle}>{metric.name}</span>
          </div>
          <div className={descriptionColumnStyle}>
            <span className={scenarioDescriptionStyle}>
              {metric.description ?? ""}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
};

// -- Component -----------------------------------------------------------------

type DrawerState =
  | { type: "closed" }
  | { type: "view-scenario"; scenarioId: string }
  | { type: "create-scenario" }
  | { type: "view-metric"; metricId: string }
  | { type: "create-metric" }
  | { type: "create-experiment" };

export const SimulateView = () => {
  const { simulateViewMode: mode, setSimulateViewMode: setMode } =
    use(EditorContext);
  const [drawer, setDrawer] = useState<DrawerState>({ type: "closed" });

  const { petriNetDefinition } = use(SDCPNContext);
  const scenarios = petriNetDefinition.scenarios ?? [];
  const metrics = petriNetDefinition.metrics ?? [];

  const selectedScenario =
    drawer.type === "view-scenario"
      ? scenarios.find((s) => s.id === drawer.scenarioId)
      : undefined;

  const selectedMetric =
    drawer.type === "view-metric"
      ? metrics.find((m) => m.id === drawer.metricId)
      : undefined;

  const closeDrawer = () => setDrawer({ type: "closed" });

  const title =
    mode === "scenarios"
      ? "Scenarios"
      : mode === "metrics"
        ? "Metrics"
        : "Experiments";

  return (
    <div className={containerStyle}>
      <div className={sidebarStyle}>
        <SegmentGroup
          value={mode}
          options={modeOptions}
          onChange={(value) => setMode(value as SimulateViewMode)}
          orientation="vertical"
          size="sm"
        />
      </div>

      <Stack className={mainContainerStyle}>
        <div className={headerStyle}>
          <span className={headerTitleStyle}>{title}</span>
          {mode === "scenarios" && (
            <Button
              variant="ghost"
              tone="neutral"
              size="xs"
              iconLeft={<TbPlus size={14} />}
              onClick={() => setDrawer({ type: "create-scenario" })}
            >
              Create scenario
            </Button>
          )}
          {mode === "metrics" && (
            <Button
              variant="ghost"
              colorScheme="neutral"
              size="xs"
              iconLeft={<TbPlus size={14} />}
              onClick={() => setDrawer({ type: "create-metric" })}
            >
              Create metric
            </Button>
          )}
          {mode === "experiments" && (
            <Button
              variant="ghost"
              tone="neutral"
              size="xs"
              prefix={<TbPlus size={14} />}
              onClick={() => setDrawer({ type: "create-experiment" })}
            >
              Create experiment
            </Button>
          )}
        </div>

        {mode === "scenarios" && (
          <>
            <div className={contentStyle}>
              <ScenarioList
                scenarios={scenarios}
                selectedId={
                  drawer.type === "view-scenario" ? drawer.scenarioId : null
                }
                onSelect={(id) =>
                  setDrawer({ type: "view-scenario", scenarioId: id })
                }
              />
            </div>

            <CreateScenarioDrawer
              open={drawer.type === "create-scenario"}
              onClose={closeDrawer}
            />

            <ViewScenarioDrawer
              open={!!selectedScenario}
              onClose={closeDrawer}
              scenario={selectedScenario}
            />
          </>
        )}
        {mode === "metrics" && (
          <>
            <div className={contentStyle}>
              <MetricList
                metrics={metrics}
                selectedId={
                  drawer.type === "view-metric" ? drawer.metricId : null
                }
                onSelect={(id) =>
                  setDrawer({ type: "view-metric", metricId: id })
                }
              />
            </div>

            <CreateMetricDrawer
              open={drawer.type === "create-metric"}
              onClose={closeDrawer}
            />

            <ViewMetricDrawer
              open={!!selectedMetric}
              onClose={closeDrawer}
              metric={selectedMetric}
            />
          </>
        )}
        {mode === "experiments" && (
          <>
            <div className={emptyStateStyle}>No experiments yet</div>

            <CreateExperimentDrawer
              open={drawer.type === "create-experiment"}
              onClose={closeDrawer}
            />
          </>
        )}
      </Stack>
    </div>
  );
};
