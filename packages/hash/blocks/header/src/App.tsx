import { BlockComponent } from "blockprotocol/react";
import React, { RefCallback } from "react";

type AppProps = {
  color?: string;
  level?: number;
  editableRef?: RefCallback<HTMLElement>;
};

/**
 * @todo restore heading level variants when links are handled by the
 *       frontend properly
 */
export const App: BlockComponent<AppProps> = ({
  color,
  level = 1,
  editableRef,
}) => {
  // @todo set type correctly
  const Header = `h${level}` as any;

  return (
    <Header
      style={{ fontFamily: "Arial", color: color ?? "black", marginBottom: 0 }}
      ref={editableRef}
    />
  );
};
