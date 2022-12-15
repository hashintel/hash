import { BlockComponent } from "@blockprotocol/graph/react";
import { useRef, useState } from "react";
import { useHook, useHookBlockService } from "@blockprotocol/hook/react";
import { Media, MediaEntityProperties } from "./components/media";

export type BlockEntityProperties = MediaEntityProperties;

export const Image: BlockComponent<BlockEntityProperties> = (props) => {
  const [showFallback, setShowFallback] = useState(false);

  const blockRef = useRef<HTMLDivElement>(null);

  const { hookService } = useHookBlockService(blockRef);

  useHook(
    hookService,
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
    <div
      ref={blockRef}
      style={{
        boxSizing: "border-box",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
      }}
    >
      {showFallback && (
        <Media {...props} blockRef={blockRef} mediaType="image" />
      )}
    </div>
  );
};
