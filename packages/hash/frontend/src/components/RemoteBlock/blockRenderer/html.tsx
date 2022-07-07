import { HtmlBlockDefinition, renderHtmlBlock } from "@blockprotocol/core";
import React, { useEffect, useRef, VFC } from "react";

type HtmlElementLoaderProps = {
  html: HtmlBlockDefinition;
};

export const HtmlLoader: VFC<HtmlElementLoaderProps> = ({ html }) => {
  const ref = useRef<HTMLDivElement>(null);

  const jsonDefinition = JSON.stringify(html);

  useEffect(() => {
    const definition: HtmlBlockDefinition = JSON.parse(jsonDefinition);

    const controller = new AbortController();
    const node = ref.current;

    if (node) {
      renderHtmlBlock(node, definition, controller.signal).catch((err: any) => {
        if (err?.name !== "AbortError") {
          node.innerText = `Error: ${err}`;
        }
      });

      return () => {
        node.innerHTML = "";
        controller.abort();
      };
    }
  }, [jsonDefinition]);

  return <div ref={ref} />;
};
