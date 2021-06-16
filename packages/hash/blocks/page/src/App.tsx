import React, { VoidFunctionComponent } from "react";
import { renderPM } from "./sandbox";

type AppProps = {
  // @todo type this
  content: any;
}

export const App: VoidFunctionComponent<AppProps> = ({ content }) => {
  return <div id="root" ref={node => {
    if (node) {
      renderPM(node, content);
    }
  }} />
};
