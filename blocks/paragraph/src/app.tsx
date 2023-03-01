import { BlockComponent, useEntitySubgraph } from "@blockprotocol/graph/react";
import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";
import { useRef } from "react";

import { propertyIds } from "./property-ids";
import { RootEntity } from "./types";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph },
}) => {
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);
  const ref = useRef<HTMLHeadingElement>(null);
  const { hookModule } = useHookBlockModule(ref);

  useHook(
    hookModule,
    ref,
    "text",
    rootEntity.metadata.recordId.entityId,
    [propertyIds.text],
    (node) => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = rootEntity.properties[propertyIds.text] ?? "";

      return () => {
        // eslint-disable-next-line no-param-reassign
        node.innerText = "";
      };
    },
  );

  return <div ref={ref} />;
};
