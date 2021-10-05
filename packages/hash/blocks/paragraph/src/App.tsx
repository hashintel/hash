import React, { RefCallback } from "react";

import { BlockComponent } from "@hashintel/block-protocol/react";

type AppProps = {
  editableRef?: RefCallback<HTMLElement>;
};

export const App: BlockComponent<AppProps> = ({ editableRef }) => (
  <p ref={editableRef} />
);
