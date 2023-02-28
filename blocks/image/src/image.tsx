import { BlockComponent, useEntitySubgraph } from "@blockprotocol/graph/react";
import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";
import { useRef, useState } from "react";
import { setup, tw } from "twind";

import { Media } from "./components/media";
import { linkIds } from "./property-ids";
import { RootEntity } from "./types";

setup({ preflight: false });

export const Image: BlockComponent<RootEntity> = (props) => {
  const { graph } = props;
  const { blockEntitySubgraph } = graph;
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);
  const [showFallback, setShowFallback] = useState(false);

  const blockRef = useRef<HTMLDivElement>(null);

  const { hookModule } = useHookBlockModule(blockRef);

  useHook(
    hookModule,
    blockRef,
    "image",
    // eslint-disable-next-line react/destructuring-assignment -- need to pass props through to Media
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
