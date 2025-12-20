import { SegmentGroup as ArkSegmentGroup } from "@ark-ui/react/segment-group";
import { css, cva } from "@hashintel/ds-helpers/css";

const containerStyle = css({
  display: "flex",
  backgroundColor: "core.gray.20",
  borderRadius: "radius.8",
  gap: "spacing.1",
  position: "relative",
  padding: "[4px]",
});

const indicatorStyle = css({
  backgroundColor: "core.gray.90",
  borderRadius: "radius.6",
  position: "absolute",
  transition: "[all 0.2s ease]",
  width: "var(--width)",
  height: "var(--height)",
  left: "var(--left)",
  top: "var(--top)",
});

const itemStyle = cva({
  base: {
    flex: "1",
    fontSize: "[13px]",
    fontWeight: 500,
    textAlign: "center",
    cursor: "pointer",
    borderRadius: "radius.6",
    transition: "[all 0.2s ease]",
    position: "relative",
    zIndex: 1,
    padding: "[4px 6px]",
  },
  variants: {
    isSelected: {
      true: { color: "core.gray.10" },
      false: { color: "core.gray.70" },
    },
  },
});

// --- Component ---

interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentGroupProps {
  value: string;
  options: SegmentOption[];
  onChange: (value: string) => void;
}

export const SegmentGroup: React.FC<SegmentGroupProps> = ({
  value,
  options,
  onChange,
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
      <div className={containerStyle}>
        <ArkSegmentGroup.Indicator className={indicatorStyle} />
        {options.map((option) => (
          <ArkSegmentGroup.Item
            key={option.value}
            value={option.value}
            className={itemStyle({ isSelected: value === option.value })}
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
