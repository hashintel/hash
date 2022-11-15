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
      entityId,
      properties: { color, level = 1, text },
    },
  },
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLHeadingElement>(null);
  const { hookService } = useHookBlockService(containerRef);

  useHook(hookService, headerRef, "text", entityId, "$.text", (node) => {
    // eslint-disable-next-line no-param-reassign
    node.innerText = text ?? "";

    return () => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = "";
    };
  });

  if (![1, 2, 3, 4, 5, 6].includes(level)) {
    throw new Error(`Unexpected level ${level} (expected 1 - 6)`);
  }
  const Header = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

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
