import React, { VoidFunctionComponent } from "react";

export interface EmojiIconProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

export const EmojiIcon: VoidFunctionComponent<EmojiIconProps> = ({
  value,
  onChange,
}) => {
  return <div>{value}</div>;
};
