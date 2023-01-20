import { BlockMetadata, UnknownRecord } from "@blockprotocol/core";
import { FunctionComponent, ReactElement } from "react";

import { CustomElementLoader } from "./block-renderer/custom-element";
import { HtmlLoader } from "./block-renderer/html";
import { UnknownBlock } from "./load-remote-block";

type BlockRendererProps = {
  blockSource: UnknownBlock;
  blockType: BlockMetadata["blockType"];
  properties: UnknownRecord;
  sourceUrl: string;
};

export const BlockRenderer: FunctionComponent<BlockRendererProps> = ({
  blockSource,
  blockType,
  properties,
  sourceUrl,
}) => {
  // @todo remove this React default when we update all blocks to 0.2
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
  const entryPoint = blockType.entryPoint ?? "react";

  if (entryPoint === "html") {
    if (typeof blockSource !== "string") {
      throw new Error(
        `'html' entryPoint expects source to be typeof 'string', but got: ${typeof blockSource}`,
      );
    }
    return <HtmlLoader html={{ source: blockSource, url: sourceUrl }} />;
  } else if (entryPoint === "custom-element") {
    if (
      typeof blockSource === "string" ||
      !(blockSource.prototype instanceof HTMLElement)
    ) {
      throw new Error(
        `'custom-element' entryPoint expects parsed source to have 'HTMLElement' as prototype`,
      );
    }
    if (typeof blockType.tagName !== "string") {
      throw new Error(
        `Must provide blockType.tagName when entryPoint is 'custom-element'`,
      );
    }
    return (
      <CustomElementLoader
        properties={properties}
        elementClass={blockSource as typeof HTMLElement}
        tagName={blockType.tagName}
      />
    );
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
  } else if (entryPoint === "react") {
    if (typeof blockSource !== "function") {
      throw new Error(
        `'react' entryPoint expects parsed source to be a function, but got: ${typeof blockSource}`,
      );
    }
    const BlockComponent = blockSource as (...props: any[]) => ReactElement;
    return <BlockComponent {...properties} />;
  }

  throw new Error(`Invalid entryPoint '${entryPoint}'`);
};
