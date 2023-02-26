import { BlockComponent } from "@blockprotocol/graph/react";
import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";
import { useRef, useState } from "react";
import { setup, tw } from "twind";

import { Media, MediaEntityProperties } from "./components/media";

export type BlockEntityProperties = MediaEntityProperties;

setup({ preflight: false });

export const Image: BlockComponent<BlockEntityProperties> = (props) => {
  const [showFallback, setShowFallback] = useState(false);

  const blockRef = useRef<HTMLDivElement>(null);

  const { hookModule } = useHookBlockModule(blockRef);

  useHook(
    hookModule,
    blockRef,
    "image",
    // eslint-disable-next-line react/destructuring-assignment -- need to pass props through to Media
    props.graph.blockEntity.entityId,
    "$.image",
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
