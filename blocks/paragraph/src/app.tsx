import { BlockComponent } from "@blockprotocol/graph/react";
import { useHook, useHookBlockService } from "@blockprotocol/hook/react";
import { useRef } from "react";

type BlockEntityProperties = {
  text?: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: {
      entityId,
      properties: { text },
    },
  },
}) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const { hookService } = useHookBlockService(ref);

  useHook(hookService, ref, "text", entityId, "$.text", (node) => {
    // eslint-disable-next-line no-param-reassign
    node.innerText = text ?? "";

    return () => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = "";
    };
  });

  return <div ref={ref} />;
};
