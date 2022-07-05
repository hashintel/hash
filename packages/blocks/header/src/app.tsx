import { BlockComponent } from "blockprotocol/react";
import React, { RefCallback, useRef } from "react";
import { useHookRef, useHookBlockService } from "@blockprotocol/hook";
import { mergeRefs } from "react-merge-refs";

type BlockEntityProperties = {
  color?: string;
  level?: number;
  editableRef?: RefCallback<HTMLElement>;
  text?: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  color,
  level = 1,
  text,
}) => {
  // @todo set type correctly
  const Header = `h${level}` as any;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const { hookService } = useHookBlockService(headingRef);
  const hookRef = useHookRef(hookService, text);

  return (
    <Header
      style={{ fontFamily: "Arial", color: color ?? "black", marginBottom: 0 }}
      ref={mergeRefs([headingRef, hookRef])}
    />
  );
};
