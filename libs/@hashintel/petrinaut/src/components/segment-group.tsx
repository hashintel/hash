import { SegmentGroup as ArkSegmentGroup } from "@ark-ui/react/segment-group";
import { css, cva } from "@hashintel/ds-helpers/css";
import { token } from "@hashintel/ds-helpers/tokens";
import type { ReactNode } from "react";

import { withTooltip } from "./hoc/with-tooltip";
import { Tooltip } from "./tooltip";

const rootStyle = cva({
  base: {
    "--root-border-width": "1px",
    display: "flex",
    alignItems: "center",
    gap: "0.5",
    backgroundColor: "neutral.s15",
    borderColor: "neutral.s25",
    position: "relative",
    borderRadius: "var(--root-border-radius)",
    borderWidth: "var(--root-border-width)",
    padding: "var(--root-padding)",
  },
  variants: {
    size: {
      md: {
        "--root-border-radius": token("radii.xl"),
        "--root-padding": "1px",
      },
      sm: {
        "--root-border-radius": token("radii.lg"),
        "--root-padding": "1px",
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const indicatorStyle = css({
  position: "absolute",
  backgroundColor: "white",
  zIndex: 0,
  boxShadow: "[0 1px 2px 0 rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06)]",
});

const itemStyle = cva({
  base: {
    flex: "1",
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "medium",
    cursor: "pointer",
    transition: "[color 200ms]",
    overflow: "hidden",
  },
  variants: {
    size: {
      md: {
        gap: "1.5",
        height: "7",
        paddingX: "2.5",
        fontSize: "sm",
        borderRadius: "md",
      },
      sm: {
        gap: "1",
        height: "5",
        paddingX: "2",
        fontSize: "xs",
        borderRadius: "sm",
      },
    },
    disabled: {
      true: {
        cursor: "not-allowed",
        opacity: "0.5",
        pointerEvents: "none",
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const itemContentStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "4",
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
  fontSize: "xs",
  flexShrink: 0,
});

const tooltipWrapperStyle = css({
  display: "contents",
});

export interface SegmentOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  tooltip?: string;
}

interface SegmentGroupProps {
  value: string;
  options: SegmentOption[];
  onChange: (value: string) => void;
  /** Size variant. Defaults to "md". */
  size?: "md" | "sm";
  disabled?: boolean;
}

const SegmentGroupBase: React.FC<SegmentGroupProps> = ({
  value,
  options,
  onChange,
  size = "md",
  disabled = false,
}) => {
  return (
    <ArkSegmentGroup.Root
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
      className={rootStyle({ size })}
    >
      <ArkSegmentGroup.Indicator
        className={indicatorStyle}
        style={{
          // ArkUI defines `top` as an inline style, so we need to override with inline styles.
          width: "var(--width)",
          height: "var(--height)",
          top: "calc(var(--top) - var(--root-border-width))",
          left: "calc(var(--left) - var(--root-border-width))",
          borderRadius:
            "calc(var(--root-border-radius) - var(--root-border-width) - var(--root-padding))",
        }}
      />

      {options.map((option) => {
        const isItemDisabled = disabled || option.disabled;

        const item = (
          <ArkSegmentGroup.Item
            key={option.value}
            value={option.value}
            disabled={isItemDisabled}
            className={itemStyle({ size, disabled: isItemDisabled })}
          >
            <ArkSegmentGroup.ItemText
              className={itemContentStyle({
                selected: value === option.value,
              })}
            >
              {option.icon && (
                <span className={itemIconStyle}>{option.icon}</span>
              )}
              {option.label}
            </ArkSegmentGroup.ItemText>
            <ArkSegmentGroup.ItemControl />
            <ArkSegmentGroup.ItemHiddenInput />
          </ArkSegmentGroup.Item>
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
    </ArkSegmentGroup.Root>
  );
};

export const SegmentGroup = withTooltip(SegmentGroupBase, "block");
