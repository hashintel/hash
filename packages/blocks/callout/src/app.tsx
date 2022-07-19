import {
  BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
import React, { RefCallback, useRef } from "react";

import { EmojiIcon } from "./emoji-icon";

type BlockEntityProperties = {
  icon?: string;
  text?: string;
  editableRef?: RefCallback<HTMLElement>;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: { entityId, properties },
  },
  ...others
}) => {
  const editableRef = (others as any).editableRef as
    | RefCallback<HTMLDivElement>
    | undefined;
  const { icon = "📢", text } = properties;

  const blockRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRef);

  const handleIconChange = (newIcon: string | undefined): void => {
    if (!entityId) {
      return;
    }

    void graphService?.updateEntity({
      data: {
        entityId,
        properties: {
          ...properties,
          icon: newIcon ?? null,
        },
      },
    });
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
      ref={blockRef}
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
