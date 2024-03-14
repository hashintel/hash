import type { FunctionComponent, MouseEventHandler } from "react";

export interface EmojiIconProps {
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
  value: string | undefined;
}

const variants = ["📢", "💡", "🤔", "👉", "📣", "📌", "🚧"];

export const EmojiIcon: FunctionComponent<EmojiIconProps> = ({
  disabled,
  onChange,
  value,
}) => {
  const handleDivClick: MouseEventHandler = (event) => {
    event.stopPropagation();
    onChange(variants[(variants.indexOf(value ?? "") + 1) % variants.length]);
  };

  return (
    <button
      disabled={disabled}
      type="button"
      contentEditable={false}
      suppressContentEditableWarning
      style={{
        display: "inline-block",
        width: "1.5em",
        left: "0.25em",
        height: "1.5em",
        cursor: disabled ? "default" : "pointer",
        textAlign: "center",
        padding: 0,
        position: "absolute",
        userSelect: "none",
        border: "none",
        background: "none",
        overflow: "hidden",
      }}
      onClick={handleDivClick}
    >
      {value}
    </button>
  );
};
