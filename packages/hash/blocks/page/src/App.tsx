import React, { VoidFunctionComponent } from "react";

import { renderPM } from "./sandbox";

type AppProps = {
}

export const App: VoidFunctionComponent<AppProps> = () => {
  return <div id="root" ref={node => {
    if (node) {
      renderPM(node);
    }
  }} />
};
