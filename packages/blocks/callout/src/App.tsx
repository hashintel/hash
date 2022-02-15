import { BlockComponent } from "blockprotocol/react";
import React, { CSSProperties, RefCallback, useCallback } from "react";

import { EmojiIcon } from "./EmojiIcon";

type AppProps = {
  editableRef?: RefCallback<HTMLElement>;
  icon?: string;
  text?: string;
};

const wrapperStyle: CSSProperties = {
  borderRadius: 5,
  padding: 10,
  background: "#eee",
  border: "1px solid #ccc",
};

const textStyle: CSSProperties = {};

export const App: BlockComponent<AppProps> = ({
  editableRef,
  icon = "💡",
  text,
  entityId,
  updateEntities,
}) => {
  const handleIconChange = useCallback(() => {
    console.log(entityId);
  }, [entityId, updateEntities]);

  return (
    <div style={wrapperStyle}>
      <EmojiIcon value={icon} onChange={handleIconChange} />
      {editableRef ? (
        <div style={textStyle} ref={editableRef} />
      ) : (
        <div style={textStyle}>{text}</div>
      )}
    </div>
  );
};
