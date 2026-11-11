import { use, useRef, useState } from "react";

import { Icon, Popover, SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SimulationContext } from "../../../../../../react/simulation/context";
import {
  findSimulator,
  SimulatorsContext,
  type SimulationMode,
} from "../../../../../../react/simulators/context";
import { RunSettingsPopoverContent } from "./run-settings-picker/popover-content";
import { summarizeRunSettings } from "./run-settings-picker/summary";

// One capsule, so that what Play computes reads as a unit apart from the
// scenario's fields beside it. It never wraps: the summary gives way first.
const capsuleStyle = css({
  display: "flex",
  alignItems: "stretch",
  gap: "[2px]",
  flexShrink: 1,
  minWidth: "0",
  marginLeft: "auto",
  padding: "[2px]",
  borderRadius: "lg",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.s10",
});

const modeStyle = css({
  display: "flex",
  flexShrink: 0,
});

const triggerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  minWidth: "0",
  paddingX: "2",
  border: "none",
  borderRadius: "md",
  backgroundColor: "[transparent]",
  color: "neutral.s120",
  fontSize: "xs",
  cursor: "pointer",
  transition: "[background-color 0.12s ease, box-shadow 0.12s ease]",
  _hover: { backgroundColor: "neutral.s25" },
  _focusVisible: {
    outlineWidth: "[2px]",
    outlineStyle: "solid",
    outlineColor: "blue.s50",
    outlineOffset: "[1px]",
  },
  "&[data-state=open]": {
    backgroundColor: "neutral.s00",
    boxShadow:
      "[0 0 0 1px var(--colors-neutral-bd-subtle), 0 1px 2px rgba(0, 0, 0, 0.06)]",
  },
});

const triggerIconStyle = css({
  flexShrink: 0,
  color: "neutral.s100",
});

const simulatorNameStyle = css({
  flexShrink: 0,
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

const detailsStyle = css({
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "neutral.fg.subtle",
  fontVariantNumeric: "tabular-nums",
});

const chevronStyle = css({
  flexShrink: 0,
  color: "neutral.s100",
  transition: "[transform 0.15s ease]",
  "[data-state=open] > &": { transform: "rotate(180deg)" },
});

const MODE_ITEMS: { value: SimulationMode; label: string }[] = [
  { value: "quick", label: "Quick simulation" },
  { value: "stochastic", label: "Stochastic" },
];

/**
 * What Play computes and with what, on one line that keeps its width: the
 * mode, and the simulator with the values it runs at. The simulator opens a
 * popover over the panel to pick another one and edit its parameters, so
 * nothing in the panel moves. While a simulation exists the mode is locked
 * and the popover is read, not edited.
 */
export const RunSettingsPicker: React.FC<{ locked: boolean }> = ({
  locked,
}) => {
  const { registrations } = use(SimulatorsContext);
  const { mode, setMode, simulatorSelection, runs, maxTime } =
    use(SimulationContext);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const selected = findSimulator(registrations, simulatorSelection.simulatorId);
  const simulatorName = selected?.label ?? "No simulator";
  const details = summarizeRunSettings({
    mode,
    specs: selected?.parameters ?? {},
    parameters: simulatorSelection.parameters,
    runs,
    maxTime,
  }).join(" · ");

  return (
    <div className={capsuleStyle} data-run-settings="">
      <div className={modeStyle}>
        <SegmentedControl
          size="xs"
          aria-label="Simulation mode"
          value={mode}
          items={MODE_ITEMS}
          onChange={(next) => setMode(next as SimulationMode)}
          disabled={locked}
        />
      </div>
      <button
        ref={triggerRef}
        type="button"
        className={triggerStyle}
        data-state={open ? "open" : "closed"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Simulator: ${[simulatorName, details].filter(Boolean).join(", ")}`}
        title={details}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <Icon name="sliders" size="xs" className={triggerIconStyle} />
        <span className={simulatorNameStyle}>{simulatorName}</span>
        {details ? <span className={detailsStyle}>{details}</span> : null}
        <Icon name="chevronDown" size="xxs" className={chevronStyle} />
      </button>
      {open ? (
        <Popover
          triggerRef={triggerRef}
          position="bottom-end"
          onClose={() => setOpen(false)}
        >
          <RunSettingsPopoverContent locked={locked} />
        </Popover>
      ) : null}
    </div>
  );
};
