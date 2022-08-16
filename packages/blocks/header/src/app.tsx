import { BlockComponent } from "@blockprotocol/graph/react";
import { useHook, useHookBlockService } from "@blockprotocol/hook/react";
import { useRef } from "react";

type BlockEntityProperties = {
  color?: string;
  level?: number;
  text?: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: {
      properties: { color, level = 1, text },
    },
  },
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLHeadingElement>(null);
  const { hookService } = useHookBlockService(containerRef);

  useHook(hookService, headerRef, "text", "$.text", (node) => {
    // eslint-disable-next-line no-param-reassign
    node.innerText = text ?? "";

    return () => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = "";
    };
  });

  // @todo set type correctly
  const Header = `h${level}` as any;

  return (
    <div ref={containerRef}>
      <Header
        style={{
          fontFamily: "Arial",
          color: color ?? "black",
          marginBottom: 0,
        }}
        ref={headerRef}
      />
    </div>
  );
};
