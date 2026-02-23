import { SegmentGroup } from "@ark-ui/react/segment-group";
import { css, cva } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
import { TbCategory, TbCircleFilled, TbPlayerPlay } from "react-icons/tb";

import { Tooltip } from "../../../components/tooltip";

export interface ModeSelectorProps {
  mode: "edit" | "simulate";
  onChange: (mode: "edit" | "simulate") => void;
}

const segmentRootStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5",
  padding: "[1px]",
  backgroundColor: "[#fafafa]",
  borderRadius: "[8px]",
  overflow: "hidden",
  borderWidth: "thin",
  borderColor: "neutral.s25",
  position: "relative",
});

const segmentIndicatorStyle = css({
  position: "absolute",
  width: "var(--width)",
  height: "var(--height)",
  left: "var(--left)",
  top: "var(--top)",
  backgroundColor: "[white]",
  borderRadius: "[6px]",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 2px 0px rgba(0, 0, 0, 0.12)]",
  transition: "[all 200ms cubic-bezier(0.4, 0, 0.2, 1)]",
  zIndex: 0,
});

const segmentItemStyle = cva({
  base: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.5",
    height: "7",
    paddingX: "2.5",
    fontSize: "sm",
    fontWeight: "medium",
    cursor: "pointer",
    transition: "[color 200ms]",
    borderRadius: "[6px]",
    overflow: "hidden",
  },
  variants: {
    disabled: {
      true: {
        cursor: "not-allowed",
        opacity: "[0.5]",
        pointerEvents: "none",
      },
    },
  },
});

const segmentItemContentStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[6px]",
    transition: "[color 200ms]",
  },
  variants: {
    selected: {
      true: {
        color: "neutral.s120",
      },
      false: {
        color: "neutral.s100",
      },
    },
  },
});

const segmentItemIconStyle = css({
  fontSize: "[12px]",
  flexShrink: 0,
});

interface ModeOption {
  name: string;
  value: string;
  icon: ReactNode;
  disabled: boolean;
  tooltip?: string;
}

const options: ModeOption[] = [
  {
    name: "Edit",
    value: "edit",
    icon: <TbCategory className={segmentItemIconStyle} />,
    disabled: false,
  },
  {
    name: "Simulate",
    value: "simulate",
    icon: <TbPlayerPlay className={segmentItemIconStyle} />,
    disabled: true,
    tooltip: "Simulate mode is not yet available.",
  },
  {
    name: "Actual",
    value: "actual",
    icon: <TbCircleFilled className={segmentItemIconStyle} />,
    disabled: true,
    tooltip: "Actual mode is not yet available.",
  },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  mode,
  onChange,
}) => {
  return (
    <SegmentGroup.Root
      value={mode}
      onValueChange={(details) => {
        if (details.value) {
          const selectedOption = options.find(
            (opt) => opt.value === details.value,
          );
          if (selectedOption && !selectedOption.disabled) {
            onChange(details.value as "edit" | "simulate");
          }
        }
      }}
      className={segmentRootStyle}
    >
      <SegmentGroup.Indicator className={segmentIndicatorStyle} />

      {options.map((option) => {
        const item = (
          <SegmentGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={segmentItemStyle({ disabled: option.disabled })}
          >
            <SegmentGroup.ItemText
              className={segmentItemContentStyle({
                selected: mode === option.value,
              })}
            >
              {option.icon}
              {option.name}
            </SegmentGroup.ItemText>
            <SegmentGroup.ItemControl />
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        );

        if (option.disabled && option.tooltip) {
          return (
            <Tooltip
              key={option.value}
              content={option.tooltip}
              display="inline"
            >
              <span>{item}</span>
            </Tooltip>
          );
        }

        return item;
      })}
    </SegmentGroup.Root>
  );
};
