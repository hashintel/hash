import { ark } from "@ark-ui/react/factory";
import { SegmentGroup as ArkSegmentGroup } from "@ark-ui/react/segment-group";
import { css, cva } from "@hashintel/ds-helpers/css";

import { Tooltip } from "./tooltip";

/**
 * Wrapper style using display:contents to be invisible to layout
 * while still forwarding tooltip event handlers.
 */
const tooltipWrapperStyle = css({
  display: "contents",
});

const containerStyle = cva({
  base: {
    display: "flex",
    backgroundColor: "gray.20",
    gap: "1",
    position: "relative",
  },
  variants: {
    size: {
      md: {
        borderRadius: "[18px]",
        padding: "[4px]",
      },
      sm: {
        borderRadius: "[12px]",
        padding: "[3px]",
      },
    },
    isDisabled: {
      true: {
        opacity: "[0.6]",
        cursor: "not-allowed",
      },
      false: {},
    },
  },
  defaultVariants: {
    size: "md",
    isDisabled: false,
  },
});

const indicatorStyle = cva({
  base: {
    backgroundColor: "gray.90",
    position: "absolute",
    transition: "[all 0.2s ease]",
    width: "var(--width)",
    height: "var(--height)",
    left: "var(--left)",
    top: "var(--top)",
  },
  variants: {
    size: {
      md: {
        borderRadius: "[14px]",
      },
      sm: {
        borderRadius: "[10px]",
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const itemStyle = cva({
  base: {
    flex: "1",
    fontWeight: "medium",
    textAlign: "center",
    transition: "[all 0.2s ease]",
    position: "relative",
    zIndex: 1,
  },
  variants: {
    isSelected: {
      true: { color: "gray.10" },
      false: { color: "gray.70" },
    },
    size: {
      md: {
        fontSize: "[13px]",
        borderRadius: "md.6",
        padding: "[4px 8px]",
      },
      sm: {
        fontSize: "[11px]",
        borderRadius: "md.4",
        padding: "[1px 8px]",
      },
    },
    isDisabled: {
      true: {
        cursor: "not-allowed",
        pointerEvents: "none",
      },
      false: {
        cursor: "pointer",
      },
    },
  },
  defaultVariants: {
    size: "md",
    isDisabled: false,
  },
});

interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentGroupProps {
  value: string;
  options: SegmentOption[];
  onChange: (value: string) => void;
  /** Size variant. Defaults to "md". */
  size?: "md" | "sm";
  /** Whether the segment group is disabled. */
  disabled?: boolean;
  /** Tooltip to show when hovering (useful for explaining disabled state). */
  tooltip?: string;
}

export const SegmentGroup: React.FC<SegmentGroupProps> = ({
  value,
  options,
  onChange,
  size = "md",
  disabled = false,
  tooltip,
}) => {
  const segmentGroupElement = (
    <ArkSegmentGroup.Root
      value={value}
      disabled={disabled}
      onValueChange={(details) => {
        if (details.value) {
          onChange(details.value);
        }
      }}
    >
      <div className={containerStyle({ size, isDisabled: disabled })}>
        <ArkSegmentGroup.Indicator className={indicatorStyle({ size })} />
        {options.map((option) => (
          <ArkSegmentGroup.Item
            key={option.value}
            value={option.value}
            className={itemStyle({
              isSelected: value === option.value,
              size,
              isDisabled: disabled,
            })}
          >
            <ArkSegmentGroup.ItemText>{option.label}</ArkSegmentGroup.ItemText>
            <ArkSegmentGroup.ItemControl />
            <ArkSegmentGroup.ItemHiddenInput />
          </ArkSegmentGroup.Item>
        ))}
      </div>
    </ArkSegmentGroup.Root>
  );

  if (tooltip) {
    // Use ark.span with display:contents to forward tooltip events
    // without affecting layout
    return (
      <Tooltip content={tooltip}>
        <ark.span className={tooltipWrapperStyle}>
          {segmentGroupElement}
        </ark.span>
      </Tooltip>
    );
  }

  return segmentGroupElement;
};
