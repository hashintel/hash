import { BlockComponent } from "blockprotocol/react";
import React, { RefCallback } from "react";

import { EmojiIcon } from "./emoji-icon";

type AppProps = {
  editableRef?: RefCallback<HTMLElement>;
  icon?: string;
  text?: string;
};

export const App: BlockComponent<AppProps> = ({
  editableRef,
  icon = "📢",
  text,
  entityId,
  updateEntities,
}) => {
  const handleIconChange = (newIcon: string | undefined): void => {
    if (!entityId) {
      return;
    }

    void updateEntities?.([
      {
        entityId,
        data: { icon: newIcon ?? null },
      },
    ]);
  };

  return (
    <div
      style={{
        borderRadius: "0.25em",
        width: "100%",
        position: "relative",
        padding: "0.5em",
        background: "#f9fafc",
        border: "1px solid #dee7f3",
      }}
    >
      <EmojiIcon
        disabled={typeof entityId !== "string"}
        onChange={handleIconChange}
        value={icon}
      />
      <div
        style={{
          minHeight: "1.5em",
          paddingLeft: "1.5em",
        }}
        ref={editableRef}
      >
        {editableRef ? undefined : text}
      </div>
    </div>
  );
};
