import { ark } from "@ark-ui/react/factory";
import { SegmentGroup as ArkSegmentGroup } from "@ark-ui/react/segment-group";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { css, cva } from "@hashintel/ds-helpers/css";

const tooltipContentStyle = css({
  backgroundColor: "gray.90",
  color: "gray.10",
  borderRadius: "md.6",
  fontSize: "[13px]",
  zIndex: "[10000]",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.15)]",
  padding: "[6px 10px]",
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
  const containerClassName = containerStyle({ size, isDisabled: disabled });

  const containerContent = (
    <>
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
    </>
  );

  if (tooltip) {
    return (
      <ArkTooltip.Root
        openDelay={200}
        closeDelay={0}
        positioning={{ placement: "top" }}
      >
        <ArkTooltip.Trigger asChild>
          <ark.div>
            <ArkSegmentGroup.Root
              value={value}
              disabled={disabled}
              onValueChange={(details) => {
                if (details.value) {
                  onChange(details.value);
                }
              }}
            >
              <div className={containerClassName}>{containerContent}</div>
            </ArkSegmentGroup.Root>
          </ark.div>
        </ArkTooltip.Trigger>
        <ArkTooltip.Positioner>
          <ArkTooltip.Content className={tooltipContentStyle}>
            {tooltip}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </ArkTooltip.Root>
    );
  }

  return (
    <ArkSegmentGroup.Root
      value={value}
      disabled={disabled}
      onValueChange={(details) => {
        if (details.value) {
          onChange(details.value);
        }
      }}
    >
      <div className={containerClassName}>{containerContent}</div>
    </ArkSegmentGroup.Root>
  );
};
