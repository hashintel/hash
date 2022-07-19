import { BlockComponent } from "@blockprotocol/graph/react";
import React, { RefCallback } from "react";

type BlockEntityProperties = {
  color?: string;
  level?: number;
  editableRef?: RefCallback<HTMLElement>;
  text?: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: {
      properties: { color, level = 1, text },
    },
  },
  ...others
}) => {
  const editableRef = (others as any).editableRef as
    | RefCallback<HTMLDivElement>
    | undefined;

  // @todo set type correctly
  const Header = `h${level}` as any;

  return editableRef ? (
    <Header
      style={{ fontFamily: "Arial", color: color ?? "black", marginBottom: 0 }}
      ref={editableRef}
    />
  ) : (
    <Header
      style={{ fontFamily: "Arial", color: color ?? "black", marginBottom: 0 }}
    >
      {text}
    </Header>
  );
};
