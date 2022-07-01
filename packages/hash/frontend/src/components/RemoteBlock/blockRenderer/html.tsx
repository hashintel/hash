import {
  assignBlockprotocolGlobals,
  blockprotocolGlobals,
} from "@blockprotocol/core";
import React, { useLayoutEffect, useRef, VFC } from "react";

type HtmlElementLoaderProps = {
  htmlString: string;
};

if (typeof window !== "undefined") {
  assignBlockprotocolGlobals();
}

export const HtmlLoader: VFC<HtmlElementLoaderProps> = ({ htmlString }) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;

    if (node) {
      node.innerHTML = "";
      const range = document.createRange();

      range.selectNodeContents(node);

      const frag = range.createContextualFragment(htmlString);
      const parent = document.createElement("div");
      parent.append(frag);

      blockprotocolGlobals.markBlockScripts(parent);

      node.appendChild(parent);

      return () => {
        node.innerHTML = "";
      };
    }
  }, [htmlString]);

  return <div ref={ref} />;
};
