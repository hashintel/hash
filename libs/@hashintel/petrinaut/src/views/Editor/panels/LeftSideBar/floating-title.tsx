import { css } from "@hashintel/ds-helpers/css";

const floatingTitleInputStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "gray.90",
  minWidth: "[200px]",
  borderRadius: "md.2",
  padding: "[4px 8px]",
  _focus: {
    outline: "2px solid",
    outlineColor: "blue.60",
    outlineOffset: "[0px]",
  },
  _placeholder: {
    color: "gray.50",
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
