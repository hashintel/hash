import {
  BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
import { useHookBlockService, useHook } from "@blockprotocol/hook/react";
import { useRef } from "react";

import { EmojiIcon } from "./emoji-icon";

type BlockEntityProperties = {
  icon?: string;
  text?: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: { entityId, properties },
  },
}) => {
  const editableRef = useRef<HTMLDivElement>(null);
  const { icon = "📢", text } = properties;

  const blockRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRef);
  const { hookService } = useHookBlockService(blockRef);

  useHook(hookService, editableRef, "text", "$.text", (node) => {
    // eslint-disable-next-line no-param-reassign
    node.innerText = text ?? "";

    return () => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = "";
    };
  });

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
      />
    </div>
  );
};
