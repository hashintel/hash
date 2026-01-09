import { SegmentGroup as ArkSegmentGroup } from "@ark-ui/react/segment-group";
import { cva } from "@hashintel/ds-helpers/css";

const containerStyle = cva({
  base: {
    display: "flex",
    backgroundColor: "core.gray.20",
    gap: "spacing.1",
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
  },
  defaultVariants: {
    size: "md",
  },
});

const indicatorStyle = cva({
  base: {
    backgroundColor: "core.gray.90",
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
    fontWeight: 500,
    textAlign: "center",
    cursor: "pointer",
    transition: "[all 0.2s ease]",
    position: "relative",
    zIndex: 1,
  },
  variants: {
    isSelected: {
      true: { color: "core.gray.10" },
      false: { color: "core.gray.70" },
    },
    size: {
      md: {
        fontSize: "[13px]",
        borderRadius: "radius.6",
        padding: "[4px 8px]",
      },
      sm: {
        fontSize: "[11px]",
        borderRadius: "radius.4",
        padding: "[1px 8px]",
      },
    },
  },
  defaultVariants: {
    size: "md",
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
}

export const SegmentGroup: React.FC<SegmentGroupProps> = ({
  value,
  options,
  onChange,
  size = "md",
}) => {
  return (
    <ArkSegmentGroup.Root
      value={value}
      onValueChange={(details) => {
        if (details.value) {
          onChange(details.value);
        }
      }}
    >
      <div className={containerStyle({ size })}>
        <ArkSegmentGroup.Indicator className={indicatorStyle({ size })} />
        {options.map((option) => (
          <ArkSegmentGroup.Item
            key={option.value}
            value={option.value}
            className={itemStyle({ isSelected: value === option.value, size })}
          >
            <ArkSegmentGroup.ItemText>{option.label}</ArkSegmentGroup.ItemText>
            <ArkSegmentGroup.ItemControl />
            <ArkSegmentGroup.ItemHiddenInput />
          </ArkSegmentGroup.Item>
        ))}
      </div>
    </ArkSegmentGroup.Root>
  );
};
