import { Icon } from "@hashintel/ds-components";

import type { SegmentOption } from "../../../../components/segment-group";
import { SegmentGroup } from "../../../../components/segment-group";

export interface ModeSelectorProps {
  mode: "edit" | "simulate";
  onChange: (mode: "edit" | "simulate") => void;
}

const options: SegmentOption[] = [
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
    disabled: true,
    tooltip: "Actual mode is not yet available.",
  },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  mode,
  onChange,
}) => {
  return (
    <SegmentGroup
      value={mode}
      options={options}
      onChange={(value) => onChange(value as "edit" | "simulate")}
    />
  );
};
