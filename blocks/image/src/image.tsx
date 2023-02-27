import { BlockComponent, useEntitySubgraph } from "@blockprotocol/graph/react";
import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";
import { useRef, useState } from "react";
import { setup, tw } from "twind";

import { Media, MediaEntityProperties } from "./components/media";
import { RootEntity } from "./types";

export type BlockEntityProperties = MediaEntityProperties;

setup({ preflight: false });

export const Image: BlockComponent<RootEntity> = (props) => {
  const { rootEntity } = useEntitySubgraph(props.graph.blockEntitySubgraph);
  const [showFallback, setShowFallback] = useState(false);

  const blockRef = useRef<HTMLDivElement>(null);

  const { hookModule } = useHookBlockModule(blockRef);

  useHook(
    hookModule,
    blockRef,
    "image",
    // eslint-disable-next-line react/destructuring-assignment -- need to pass props through to Media
    rootEntity.metadata.recordId.entityId,
    // @todo what should this be – was 'image' before
    ["image"],
    () => {
      setShowFallback(true);
    },
  );

  return (
    <div ref={blockRef} className={tw`font-sans box-border`}>
      {showFallback && (
        <Media {...props} blockRef={blockRef} mediaType="image" />
      )}
    </div>
  );
};
