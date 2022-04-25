import { BlockComponent } from "blockprotocol/react";
import React, { RefCallback } from "react";

type AppProps = {
  color?: string;
  level?: number;
  editableRef?: RefCallback<HTMLElement>;
  text?: string;
};

export const App: BlockComponent<AppProps> = ({
  color,
  level = 1,
  editableRef,
  text,
}) => {
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
