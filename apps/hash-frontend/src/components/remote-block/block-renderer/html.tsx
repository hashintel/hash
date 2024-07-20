import type { FunctionComponent , useEffect, useRef, useState } from "react";
import type { HtmlBlockDefinition , renderHtmlBlock } from "@blockprotocol/core/html";

interface HtmlElementLoaderProps {
  html: HtmlBlockDefinition;
}

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
      renderHtmlBlock(node, definition, controller.signal).catch((error) => {
        if (error?.name !== "AbortError") {
          node.innerText = `Error: ${error}`;
          setError(() => {
            throw new Error(`Error rendering HTML block: ${error}`);
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
