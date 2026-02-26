import { TbCategory, TbCircleFilled, TbPlayerPlay } from "react-icons/tb";

import type { SegmentOption } from "../../../components/segment-group";
import { SegmentGroup } from "../../../components/segment-group";

export interface ModeSelectorProps {
  mode: "edit" | "simulate";
  onChange: (mode: "edit" | "simulate") => void;
}

const options: SegmentOption[] = [
  {
    label: "Edit",
    value: "edit",
    icon: <TbCategory />,
  },
  {
    label: "Simulate",
    value: "simulate",
    icon: <TbPlayerPlay />,
    disabled: true,
    tooltip: "Simulate mode is not yet available.",
  },
  {
    label: "Actual",
    value: "actual",
    icon: <TbCircleFilled />,
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
