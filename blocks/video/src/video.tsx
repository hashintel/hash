import type { BlockComponent } from "@blockprotocol/graph/react";
import { useRef } from "react";
import { setup } from "twind";

import { Media } from "./components/media";
import type { BlockEntity } from "./types/generated/block-entity";

setup({ preflight: false });

export const Video: BlockComponent<BlockEntity> = (props) => {
  const blockRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={blockRef}>
      <Media {...props} blockRef={blockRef} />
    </div>
  );
};
