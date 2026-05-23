import { css } from "@hashintel/ds-helpers/css";

const floatingTitleInputStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  flex: "1",
  minWidth: "0",
  borderRadius: "sm",
  px: "2",
  py: "1",
  _focus: {
    outline: "2px solid",
    outlineColor: "blue.s60",
    outlineOffset: "0",
  },
  _placeholder: {
    color: "neutral.s100",
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
