import { BlockComponent } from "@blockprotocol/graph/react";
import { useRef } from "react";
import { setup } from "twind";

import { Media } from "./components/media";
import { RootEntity } from "./types";

setup({ preflight: false });

export const Video: BlockComponent<RootEntity> = (props) => {
  const blockRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={blockRef}>
      <Media {...props} blockRef={blockRef} mediaType="video" />
    </div>
  );
};
