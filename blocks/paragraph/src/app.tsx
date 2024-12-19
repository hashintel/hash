import type { BlockComponent } from "@blockprotocol/graph/react";
import { useEntitySubgraph } from "@blockprotocol/graph/react";
import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";
import { useRef } from "react";

import { propertyIds } from "./property-ids";
import type { BlockEntity } from "./types/generated/block-entity";

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph },
}) => {
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);
  const ref = useRef<HTMLHeadingElement>(null);
  /* @ts-expect-error -- @todo H-3839 hook package in BP repo needs updating for new ref type */
  const { hookModule } = useHookBlockModule(ref);

  useHook(
    hookModule,
    ref,
    "text",
    rootEntity.metadata.recordId.entityId,
    [propertyIds.text],
    (node) => {
      const textualContent = rootEntity.properties[propertyIds.text];
      // eslint-disable-next-line no-param-reassign
      node.innerText = typeof textualContent === "string" ? textualContent : "";

      return () => {
        // eslint-disable-next-line no-param-reassign
        node.innerText = "";
      };
    },
  );

  return <div ref={ref} />;
};
