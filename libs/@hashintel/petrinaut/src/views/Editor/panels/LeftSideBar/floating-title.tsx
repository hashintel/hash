import { css } from "@hashintel/ds-helpers/css";

const floatingTitleInputStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s90",
  minWidth: "[200px]",
  borderRadius: "sm",
  padding: "[4px 8px]",
  _focus: {
    outline: "2px solid",
    outlineColor: "blue.s60",
    outlineOffset: "[0px]",
  },
  _placeholder: {
    color: "neutral.s50",
  },
});

export interface FloatingTitleProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const FloatingTitle: React.FC<FloatingTitleProps> = ({
  value,
  onChange,
  placeholder = "Process",
}: FloatingTitleProps) => {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={floatingTitleInputStyle}
    />
  );
};
