import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { LuLayers2 } from "react-icons/lu";
import { PiFlaskBold } from "react-icons/pi";

import type { SegmentOption } from "../../../../components/segment-group";
import { SegmentGroup } from "../../../../components/segment-group";
import { Stack } from "../../../../components/stack";

type SimulateMode = "experiments" | "results";

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
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s80",
  fontSize: "sm",
});

const modeOptions: SegmentOption[] = [
  {
    value: "experiments",
    label: "Experiments",
    icon: <LuLayers2 size={16} />,
    hideLabel: true,
    tooltip: "Experiments",
  },
  {
    value: "results",
    label: "Results",
    icon: <PiFlaskBold size={16} />,
    hideLabel: true,
    tooltip: "Results",
  },
];

export const SimulateView = () => {
  const [mode, setMode] = useState<SimulateMode>("experiments");

  const title = mode === "experiments" ? "Experiments" : "Results";

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
        </div>
        <div className={contentStyle}>
          {mode === "experiments"
            ? "Experiments view coming soon"
            : "Results view coming soon"}
        </div>
      </Stack>
    </div>
  );
};
