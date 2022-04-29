import React, { useEffect, useRef, VoidFunctionComponent } from "react";
import { BlockProtocolFunctions, BlockProtocolProps } from "blockprotocol";

type HtmlBlockProps = {
  blockFunctions: BlockProtocolFunctions;
  blockProperties: Omit<BlockProtocolProps, keyof BlockProtocolFunctions>;
  html: string;
};

declare global {
  interface Window {
    [key: string]: any;
  }
}

/**
 * Renders a block from a HTML string. Re-renders it when properties change.
 * The entityId is attached to the parent element and the properties to the window, so that the block can pick it up.
 * Without sandboxing, rendering a HTML block risks the block polluting the global scope, and is not advised.
 * @see /packages/blocks/html-para/index.html for an example
 * @todo add this 'attach to the window' approach to the spec or come up with a better one
 */
export const HtmlBlock: VoidFunctionComponent<HtmlBlockProps> = ({
  blockFunctions,
  blockProperties,
  html,
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const previousPropertiesString = useRef<string | null>(null);

  useEffect(() => {
    if (!divRef.current) {
      return;
    }

    if (previousPropertiesString.current === JSON.stringify(blockProperties)) {
      return;
    }
    previousPropertiesString.current = JSON.stringify(blockProperties);

    const docFragment = document.createRange().createContextualFragment(html);

    divRef.current.innerHTML = "";
    divRef.current.appendChild(docFragment);
  }, [blockProperties, html]);

  // attach the BP functions to the global scope if we haven't already
  for (const [fnName, fn] of Object.entries(blockFunctions)) {
    if (!window[fnName]) {
      window[fnName] = fn;
    }
  }

  // attach the block's own properties to the window under its entityId
  window[blockProperties.entityId] = blockProperties;

  // make the entityId available on `[div].dataset.entityId` so that the block can look it up
  return <div ref={divRef} data-entity-id={blockProperties.entityId} />;
};
