import React, { VoidFunctionComponent } from "react";

export interface EmojiIconProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

const icons = ["💡", "🤔", "⚠️", "📌", "🚧"];

export const EmojiIcon: VoidFunctionComponent<EmojiIconProps> = ({
  value,
  onChange,
}) => {
  const handleDivClick = () => {
    onChange(icons[(icons.indexOf(value ?? "") + 1) % icons.length]);
  };

  return <div onClick={handleDivClick}>{value}</div>;
};
