import { SegmentGroup } from "@ark-ui/react/segment-group";
import { css, cva } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

import { withTooltip } from "./hoc/with-tooltip";
import { Tooltip } from "./tooltip";

const rootStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5",
  padding: "[3px]",
  backgroundColor: "[#fafafa]",
  borderRadius: "[10px]",
  borderWidth: "thin",
  borderColor: "neutral.s25",
  position: "relative",
});

const indicatorStyle = css({
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

const itemStyle = cva({
  base: {
    flex: "1",
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

const itemContentStyle = cva({
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

const itemIconStyle = css({
  fontSize: "[12px]",
  flexShrink: 0,
});

const tooltipWrapperStyle = css({
  display: "contents",
});

export interface OutlinedSegmentOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  tooltip?: string;
}

interface OutlinedSegmentGroupProps {
  value: string;
  options: OutlinedSegmentOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

const OutlinedSegmentGroupBase: React.FC<OutlinedSegmentGroupProps> = ({
  value,
  options,
  onChange,
  disabled = false,
}) => {
  return (
    <SegmentGroup.Root
      value={value}
      disabled={disabled}
      onValueChange={(details) => {
        if (details.value) {
          const selectedOption = options.find(
            (opt) => opt.value === details.value,
          );
          if (selectedOption && !selectedOption.disabled) {
            onChange(details.value);
          }
        }
      }}
      className={rootStyle}
    >
      <SegmentGroup.Indicator className={indicatorStyle} />

      {options.map((option) => {
        const isItemDisabled = disabled || option.disabled;

        const item = (
          <SegmentGroup.Item
            key={option.value}
            value={option.value}
            disabled={isItemDisabled}
            className={itemStyle({ disabled: isItemDisabled })}
          >
            <SegmentGroup.ItemText
              className={itemContentStyle({
                selected: value === option.value,
              })}
            >
              {option.icon && (
                <span className={itemIconStyle}>{option.icon}</span>
              )}
              {option.label}
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
              <span className={tooltipWrapperStyle}>{item}</span>
            </Tooltip>
          );
        }

        return item;
      })}
    </SegmentGroup.Root>
  );
};

export const OutlinedSegmentGroup = withTooltip(
  OutlinedSegmentGroupBase,
  "block",
);
