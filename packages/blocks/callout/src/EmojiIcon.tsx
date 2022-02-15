import React, {
  CSSProperties,
  MouseEventHandler,
  VoidFunctionComponent,
} from "react";

export interface EmojiIconProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

const variants = ["📢", "💡", "🤔", "👉", "📣", "📌", "🚧"];

const wrapperStyle: CSSProperties = {
  width: 20,
  height: 20,
  cursor: "pointer",
  position: "absolute",
  userSelect: "none",
  textDecoration: "none",
  overflow: "hidden",
};

export const EmojiIcon: VoidFunctionComponent<EmojiIconProps> = ({
  value,
  onChange,
}) => {
  const handleDivClick: MouseEventHandler = (event) => {
    event.stopPropagation();
    onChange(variants[(variants.indexOf(value ?? "") + 1) % variants.length]);
  };

  return (
    <a
      href="#"
      contentEditable="false"
      style={wrapperStyle}
      onClick={handleDivClick}
    >
      {value}
    </a>
  );
};
