import { css } from "@hashintel/ds-helpers/css";

export interface FloatingTitleProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const FloatingTitle = ({
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
      className={css({
        background: "[rgba(255, 255, 255, 0.5)]",
        backdropFilter: "[blur(22px)]",
        border: "1px solid",
        borderColor: "core.gray.20",
        borderRadius: "radius.8",
        fontSize: "size.textsm",
        fontWeight: "medium",
        color: "core.gray.90",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        minWidth: "[200px]",
        _focus: {
          outline: "2px solid",
          outlineColor: "core.blue.60",
          outlineOffset: "[0px]",
        },
        _placeholder: {
          color: "core.gray.50",
        },
      })}
      style={{ padding: "4px 8px" }}
    />
  );
};
