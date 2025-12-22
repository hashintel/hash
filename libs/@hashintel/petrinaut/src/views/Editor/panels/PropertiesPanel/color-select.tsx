import { Portal } from "@ark-ui/react/portal";
import { createListCollection, Select } from "@ark-ui/react/select";
import { css, cva } from "@hashintel/ds-helpers/css";
import { TbChevronDown } from "react-icons/tb";

const triggerStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "[8px]",
    padding: "[6px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "[4px]",
    fontSize: "[14px]",
    width: "[100%]",
  },
  variants: {
    isDisabled: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        cursor: "not-allowed",
        opacity: "[0.5]",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "pointer",
        opacity: "[1]",
      },
    },
  },
});

const triggerValueContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const colorSwatchStyle = css({
  width: "[20px]",
  height: "[20px]",
  borderRadius: "[3px]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  flexShrink: 0,
});

const colorCodeStyle = css({
  fontSize: "[12px]",
  fontFamily: "[monospace]",
});

const indicatorIconStyle = css({
  fontSize: "[16px]",
  color: "[#666]",
});

const contentStyle = css({
  backgroundColor: "[white]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  boxShadow: "[0 4px 12px rgba(0, 0, 0, 0.15)]",
  padding: "[4px]",
  zIndex: 1000,
});

const itemStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "[8px]",
  padding: "[8px 10px]",
  cursor: "pointer",
  borderRadius: "[3px]",
  fontSize: "[13px]",
  transition: "[background-color 0.15s ease]",
});

const itemValueContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const checkmarkStyle = css({
  fontSize: "[14px]",
  color: "[#3b82f6]",
});

// Pool of 10 well-differentiated colors for types
const TYPE_COLOR_POOL = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#ef4444", label: "Red" },
  { value: "#10b981", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#f97316", label: "Orange" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#84cc16", label: "Lime" },
];

interface ColorSelectProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export const ColorSelect: React.FC<ColorSelectProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const collection = createListCollection({ items: TYPE_COLOR_POOL });

  return (
    <Select.Root
      collection={collection}
      value={[value]}
      onValueChange={(details) => {
        const selectedColor = details.value[0];
        if (selectedColor) {
          onChange(selectedColor);
        }
      }}
      disabled={disabled}
      positioning={{ sameWidth: true }}
    >
      <Select.Control>
        <Select.Trigger className={triggerStyle({ isDisabled: disabled })}>
          <div className={triggerValueContainerStyle}>
            <div
              className={colorSwatchStyle}
              style={{ backgroundColor: value }}
            />
            <div className={colorCodeStyle}>{value}</div>
          </div>
          <Select.Indicator>
            <TbChevronDown className={indicatorIconStyle} />
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content className={contentStyle}>
            <Select.ItemGroup>
              {collection.items.map((item) => (
                <Select.Item key={item.value} item={item} className={itemStyle}>
                  <div className={itemValueContainerStyle}>
                    <div
                      className={colorSwatchStyle}
                      style={{ backgroundColor: item.value }}
                    />
                    <Select.ItemText>
                      <div className={colorCodeStyle}>{item.value}</div>
                    </Select.ItemText>
                  </div>
                  <Select.ItemIndicator>
                    <span className={checkmarkStyle}>✓</span>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.ItemGroup>
          </Select.Content>
        </Select.Positioner>
      </Portal>
      <Select.HiddenSelect />
    </Select.Root>
  );
};
