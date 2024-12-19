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
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLHeadingElement>(null);
  /* @ts-expect-error -- @todo H-3839 hook package in BP repo needs updating for new ref type */
  const { hookModule } = useHookBlockModule(containerRef);

  const {
    [propertyIds.color]: color,
    [propertyIds.level]: level = 1,
    [propertyIds.textualContent]: textualContent,
  } = rootEntity.properties;

  useHook(
    hookModule,
    headerRef,
    "text",
    rootEntity.metadata.recordId.entityId,
    [propertyIds.textualContent],
    (node) => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = typeof textualContent === "string" ? textualContent : "";

      return () => {
        // eslint-disable-next-line no-param-reassign
        node.innerText = "";
      };
    },
  );

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
