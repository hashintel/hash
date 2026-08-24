import { SegmentedControl } from "@hashintel/ds-components";

import type { EditorGlobalMode } from "../../../../../react/state/editor-context";
import type { SegmentedControlItem } from "@hashintel/ds-components";

export interface ModeSelectorProps {
  actualModeAvailable: boolean;
  mode: EditorGlobalMode;
  onChange: (mode: EditorGlobalMode) => void;
}

const getOptions = (
  actualModeAvailable: boolean,
): SegmentedControlItem<EditorGlobalMode>[] => [
  {
    label: "Edit",
    value: "edit",
    iconName: "shapes",
  },
  {
    label: "Simulate",
    value: "simulate",
    iconName: "play",
  },
  {
    label: "Actual",
    value: "actual",
    iconName: "circleFilled",
    disabled: !actualModeAvailable,
    tooltip: actualModeAvailable
      ? "View actual execution state."
      : "Actual mode is not yet available.",
  },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  actualModeAvailable,
  mode,
  onChange,
}) => {
  return (
    <SegmentedControl
      size="sm"
      value={mode}
      items={getOptions(actualModeAvailable)}
      onChange={onChange}
    />
  );
};
