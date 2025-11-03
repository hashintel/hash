import { SegmentGroup as ArkSegmentGroup } from "@ark-ui/react/segment-group";
import { css } from "@hashintel/ds-helpers/css";

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
      <div
        className={css({
          display: "flex",
          backgroundColor: "core.gray.20",
          borderRadius: "radius.8",
          gap: "spacing.1",
          position: "relative",
        })}
        style={{ padding: 4 }}
      >
        <ArkSegmentGroup.Indicator
          className={css({
            backgroundColor: "core.gray.90",
            borderRadius: "radius.6",
            position: "absolute",
            transition: "[all 0.2s ease]",
            width: "var(--width)",
            height: "var(--height)",
            left: "var(--left)",
            top: "var(--top)",
          })}
        />
        {options.map((option) => (
          <ArkSegmentGroup.Item
            key={option.value}
            value={option.value}
            className={css({
              flex: "1",
              fontSize: "[13px]",
              fontWeight: 500,
              textAlign: "center",
              cursor: "pointer",
              borderRadius: "radius.6",
              transition: "[all 0.2s ease]",
              position: "relative",
              zIndex: 1,
              color: value === option.value ? "core.gray.10" : "core.gray.70",
            })}
            style={{ padding: "4px 6px" }}
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
