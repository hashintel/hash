import { css } from "@hashintel/ds-helpers/css";
import { use, useState } from "react";
import { LuLayers2 } from "react-icons/lu";
import { PiFlaskBold } from "react-icons/pi";
import { TbChartBar, TbPlus } from "react-icons/tb";

import { Button } from "../../../../components/button";
import type { SegmentOption } from "../../../../components/segment-group";
import { SegmentGroup } from "../../../../components/segment-group";
import { Stack } from "../../../../components/stack";
import type { Scenario } from "../../../../core/types/sdcpn";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { CreateExperimentDrawer } from "./create-experiment-drawer";
import { CreateScenarioDrawer } from "./create-scenario-drawer";
import { ViewScenarioDrawer } from "./view-scenario-drawer";

type SimulateMode = "scenarios" | "metrics" | "experiments";

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
    tooltip: "Metrics not yet available",
    disabled: true,
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

// -- Component -----------------------------------------------------------------

type DrawerState =
  | { type: "closed" }
  | { type: "view"; scenarioId: string }
  | { type: "create" }
  | { type: "create-experiment" };

export const SimulateView = () => {
  const [mode, setMode] = useState<SimulateMode>("scenarios");
  const [drawer, setDrawer] = useState<DrawerState>({ type: "closed" });

  const { petriNetDefinition } = use(SDCPNContext);
  const scenarios = petriNetDefinition.scenarios ?? [];

  const selectedScenario =
    drawer.type === "view"
      ? scenarios.find((s) => s.id === drawer.scenarioId)
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
          onChange={(value) => setMode(value as SimulateMode)}
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
              colorScheme="neutral"
              size="xs"
              iconLeft={<TbPlus size={14} />}
              onClick={() => setDrawer({ type: "create" })}
            >
              Create scenario
            </Button>
          )}
          {mode === "experiments" && (
            <Button
              variant="ghost"
              colorScheme="neutral"
              size="xs"
              iconLeft={<TbPlus size={14} />}
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
                selectedId={drawer.type === "view" ? drawer.scenarioId : null}
                onSelect={(id) => setDrawer({ type: "view", scenarioId: id })}
              />
            </div>

            <CreateScenarioDrawer
              open={drawer.type === "create"}
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
          <div className={emptyStateStyle}>Metrics coming soon</div>
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
