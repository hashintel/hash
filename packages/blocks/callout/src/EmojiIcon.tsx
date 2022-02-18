import React, {
  CSSProperties,
  MouseEventHandler,
  VoidFunctionComponent,
} from "react";

export interface EmojiIconProps {
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
  value: string | undefined;
}

const variants = ["📢", "💡", "🤔", "👉", "📣", "📌", "🚧"];

const wrapperStyle: CSSProperties = {
  display: "inline-block",
  width: "1.5em",
  left: "0.25em",
  height: "1.5em",
  cursor: "pointer",
  textAlign: "center",
  padding: 0,
  position: "absolute",
  userSelect: "none",
  border: "none",
  background: "none",
  overflow: "hidden",
};

export const EmojiIcon: VoidFunctionComponent<EmojiIconProps> = ({
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
      style={wrapperStyle}
      onClick={handleDivClick}
    >
      {value}
    </button>
  );
};
