import { Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const colorSwatchStyle = css({
  width: "4",
  height: "4",
  borderRadius: "xs",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  flexShrink: 0,
});

const colorCodeStyle = css({
  fontSize: "xs",
  fontFamily: "mono",
});

const itemContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
});

// Pool of 10 well-differentiated colors for types
const TYPE_COLOR_POOL = [
  { value: "#3b82f6", text: "Blue" },
  { value: "#ef4444", text: "Red" },
  { value: "#10b981", text: "Green" },
  { value: "#f59e0b", text: "Amber" },
  { value: "#8b5cf6", text: "Violet" },
  { value: "#ec4899", text: "Pink" },
  { value: "#14b8a6", text: "Teal" },
  { value: "#f97316", text: "Orange" },
  { value: "#6366f1", text: "Indigo" },
  { value: "#84cc16", text: "Lime" },
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
  return (
    <Select
      required
      value={value}
      onChange={onChange}
      items={TYPE_COLOR_POOL}
      disabled={disabled}
      size="sm"
      renderItem={(itemValue) => (
        <div className={itemContainerStyle}>
          <div
            className={colorSwatchStyle}
            style={{ backgroundColor: itemValue }}
          />
          <span className={colorCodeStyle}>{itemValue}</span>
        </div>
      )}
    />
  );
};
