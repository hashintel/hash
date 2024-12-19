import type { BlockComponent } from "@blockprotocol/graph/react";
import { useEntitySubgraph } from "@blockprotocol/graph/react";
import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";
import { useRef, useState } from "react";
import { setup, tw } from "twind";

import { Media } from "./components/media";
import { linkIds } from "./property-ids";
import type { BlockEntity } from "./types/generated/block-entity";

setup({ preflight: false });

export const Image: BlockComponent<BlockEntity> = (props) => {
  const { graph } = props;
  const { blockEntitySubgraph } = graph;
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);
  const [showFallback, setShowFallback] = useState(false);

  const blockRef = useRef<HTMLDivElement>(null);

  /* @ts-expect-error -- @todo H-3839 hook package in BP repo needs updating for new ref type */
  const { hookModule } = useHookBlockModule(blockRef);

  useHook(
    hookModule,
    blockRef,
    "image",
    rootEntity.metadata.recordId.entityId,
    [linkIds.file],
    () => {
      setShowFallback(true);
    },
  );

  return (
    <div ref={blockRef} className={tw`font-sans box-border`}>
      {showFallback && <Media {...props} blockRef={blockRef} />}
    </div>
  );
};
