import type { HtmlBlockDefinition } from "@blockprotocol/core";
import { renderHtmlBlock } from "@blockprotocol/core";
import type { FunctionComponent } from "react";
import { useEffect, useRef, useState } from "react";

type HtmlElementLoaderProps = {
  html: HtmlBlockDefinition;
};

export const HtmlLoader: FunctionComponent<HtmlElementLoaderProps> = ({
  html,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [, setError] = useState<never>();

  const jsonDefinition = JSON.stringify(html);

  useEffect(() => {
    const definition: HtmlBlockDefinition = JSON.parse(jsonDefinition);

    const controller = new AbortController();
    const node = ref.current;

    if (node) {
      renderHtmlBlock(node, definition, controller.signal).catch((err) => {
        if (err?.name !== "AbortError") {
          node.innerText = `Error: ${err}`;
          setError(() => {
            throw new Error(`Error rendering HTML block: ${err}`);
          });
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
