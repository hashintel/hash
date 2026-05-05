import { css } from "@hashintel/ds-helpers/css";

import { Select } from "../../../../../components/select";

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
  return (
    <Select
      value={value}
      onValueChange={onChange}
      options={TYPE_COLOR_POOL}
      disabled={disabled}
      size="sm"
      renderTrigger={({ selectedOption }) => (
        <div className={itemContainerStyle}>
          <div
            className={colorSwatchStyle}
            style={{ backgroundColor: selectedOption?.value ?? value }}
          />
          <span className={colorCodeStyle}>
            {selectedOption?.value ?? value}
          </span>
        </div>
      )}
      renderItem={(option) => (
        <div className={itemContainerStyle}>
          <div
            className={colorSwatchStyle}
            style={{ backgroundColor: option.value }}
          />
          <span className={colorCodeStyle}>{option.value}</span>
        </div>
      )}
    />
  );
};
