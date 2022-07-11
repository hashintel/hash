import React, { RefCallback } from "react";

import { BlockComponent } from "blockprotocol/react";

type BlockEntityProperties = {
  editableRef?: RefCallback<HTMLElement>;
  text?: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  editableRef,
  text,
}) => {
  return editableRef ? <p ref={editableRef} /> : <p>{text}</p>;
};
