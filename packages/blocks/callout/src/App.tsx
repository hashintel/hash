import { BlockComponent } from "blockprotocol/react";
import React, { CSSProperties, RefCallback, useCallback } from "react";

import { EmojiIcon } from "./EmojiIcon";

type AppProps = {
  editableRef?: RefCallback<HTMLElement>;
  icon?: string;
  text?: string;
};

const wrapperStyle: CSSProperties = {
  borderRadius: "0.25em",
  width: "100%",
  position: "relative",
  padding: "0.5em",
  background: "#f9fafc",
  border: "1px solid #dee7f3",
};

const textStyle: CSSProperties = {
  minHeight: "1.5em",
  paddingLeft: "1.5em",
};

export const App: BlockComponent<AppProps> = ({
  editableRef,
  icon,
  text,
  entityId,
  updateEntities,
}) => {
  const handleIconChange = useCallback(
    (newIcon: string | undefined): void => {
      if (!entityId) {
        return;
      }

      void updateEntities?.([
        {
          entityId,
          data: { icon: newIcon ?? null },
        },
      ]);
    },
    [entityId, updateEntities],
  );

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
