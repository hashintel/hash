import React, { RefCallback } from "react";

import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  editableRef?: RefCallback<HTMLElement>;
  text?: string;
};

export const App: BlockComponent<AppProps> = ({ editableRef, text }) => {
  return editableRef ? <p ref={editableRef} /> : <p>{text}</p>;
};
