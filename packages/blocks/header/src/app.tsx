import { useHookBlockService, useHookRef } from "@blockprotocol/hook";
import { BlockComponent } from "@blockprotocol/graph/react";
import { useRef } from "react";
import useForkRef from "@rooks/use-fork-ref";

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
  const headerRef = useRef<HTMLHeadingElement>(null);
  const { hookService } = useHookBlockService(headerRef);
  const headerHookRef = useHookRef(hookService, "text", "$.text", (node) => {
    if (node) {
      // eslint-disable-next-line no-param-reassign
      node.innerText = text ?? "";
    }
  });

  // @todo set type correctly
  const Header = `h${level}` as any;

  const ref = useForkRef(headerRef, headerHookRef);

  return (
    <Header
      style={{ fontFamily: "Arial", color: color ?? "black", marginBottom: 0 }}
      ref={ref}
    />
  );
};
