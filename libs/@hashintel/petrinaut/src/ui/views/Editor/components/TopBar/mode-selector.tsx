import { Icon } from "@hashintel/ds-components";

import { SegmentGroup } from "../../../../components/segment-group";

import type { EditorGlobalMode } from "../../../../../react/state/editor-context";
import type { SegmentOption } from "../../../../components/segment-group";

export interface ModeSelectorProps {
  actualModeAvailable: boolean;
  mode: EditorGlobalMode;
  onChange: (mode: EditorGlobalMode) => void;
}

const getOptions = (actualModeAvailable: boolean): SegmentOption[] => [
  {
    label: "Edit",
    value: "edit",
    icon: <Icon name="shapes" size="sm" />,
  },
  {
    label: "Simulate",
    value: "simulate",
    icon: <Icon name="play" size="sm" />,
  },
  {
    label: "Actual",
    value: "actual",
    icon: <Icon name="circleFilled" size="sm" />,
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
    <SegmentGroup
      value={mode}
      options={getOptions(actualModeAvailable)}
      onChange={(value) => onChange(value as EditorGlobalMode)}
    />
  );
};
