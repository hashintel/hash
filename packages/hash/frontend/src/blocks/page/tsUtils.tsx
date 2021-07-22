import { Schema as JSONSchema } from "jsonschema";
import React, { ReactNode } from "react";
import { EditorProps, NodeView } from "prosemirror-view";
import { RemoteBlock } from "../../components/RemoteBlock/RemoteBlock";
import { BlockMetadata } from "../../types/blockProtocol";

// @ts-ignore
const contextRequire = require.context(
  "../../../",
  false,
  /blockPaths(\.sample)?\.json$/
);

export const blockPaths = contextRequire(
  contextRequire.keys().includes("./blockPaths.json")
    ? "./blockPaths.json"
    : "./blockPaths.sample.json"
);

export type Block = {
  entityId: string;
  accountId: string;
  entity: Record<any, any>;
  componentId: string;
  componentMetadata: BlockMetadata & { url: string } & (
    | { type?: undefined }
    | {
        type: "prosemirror";
        // @todo type this
        spec: any;
      }
  );
  componentSchema: JSONSchema;
};

export type BlockMeta = Pick<Block, "componentMetadata" | "componentSchema">;

/**
 * The cache is designed to store promises, not resolved values, in order to ensure multiple requests for the same
 * block in rapid succession don't cause multiple web requests
 * 
 * @deprecated in favor of react context "blockMeta" (which is not the final solution either)
 */
export const blockCache = new Map<string, Promise<BlockMeta>>();

export const builtInBlocks: Record<string, BlockMeta> = {
  // @todo maybe this should be a nodeview too
  "https://block.blockprotocol.org/paragraph": {
    componentSchema: {},
    componentMetadata: {
      url: "https://block.blockprotocol.org/paragraph",
      name: "paragraph",
      type: "prosemirror",
      spec: {
        content: "text*",
        domTag: "p",
        marks: "_",
      },
      // @todo add missing metadata to the paragraph's default variant
      variants: [{
        name: "paragraph",
        description: "",
        icon: "path/to/icon/svg",
        properties: {}
      }]
    },
  },
};

// @todo deal with errors, loading, abort etc.
export const fetchBlockMeta = async (url: string): Promise<BlockMeta> => {
  const mappedUrl = blockPaths[url] ?? url;
  if (builtInBlocks[mappedUrl]) {
    return builtInBlocks[mappedUrl];
  }

  if (blockCache.has(mappedUrl)) {
    return blockCache.get(mappedUrl)!;
  }

  const promise = (async () => {
    const metadata = await (
      await fetch(`${mappedUrl}/metadata.json`)
    ).json();

    const schema = await (
      await fetch(`${mappedUrl}/${metadata.schema}`)
    ).json();

    const result: BlockMeta = {
      componentMetadata: {
        ...metadata,
        url: mappedUrl,
      },
      componentSchema: schema,
    };

    return result;
  })();

  if (typeof window !== "undefined") {
    blockCache.set(mappedUrl, promise);
  }

  return await promise;
};

export type BlockWithoutMeta = Omit<
  Block,
  "componentMetadata" | "componentSchema"
>;

/**
 * For some reason, I wanted to strip special characters from component URLs when generating their prosemirror node id,
 * which in hindsight seems unnecessary
 *
 * @todo remove this
 */
export const componentUrlToProsemirrorId = (componentId: string) => {
  const stripped = componentId.replace(/[^a-zA-Z0-9]/g, "");
  return stripped.slice(0, 1).toUpperCase() + stripped.slice(1);
};

/**
 * @todo this API could possibly be simpler
 */
export type ReplacePortals = (
  existingNode: HTMLElement | null,
  nextNode: HTMLElement | null,
  reactNode: ReactNode | null
) => void;
type NodeViewConstructorArgs = Parameters<
  NonNullable<EditorProps["nodeViews"]>[string]
>;
type NodeViewConstructor = {
  new (...args: NodeViewConstructorArgs): NodeView;
};

/**
 * This creates a node view which integrates between React and prosemirror for each block
 */
export const createNodeView = (
  name: string,
  componentSchema: Block["componentSchema"],
  url: string,
  replacePortal: ReplacePortals
): NodeViewConstructor => {
  const editable = componentSchema.properties?.["editableRef"];

  const nodeView = class BlockWrapper implements NodeView {
    dom: HTMLDivElement = document.createElement("div");
    contentDOM: HTMLElement | undefined = undefined;

    private target = document.createElement("div");

    // @todo types
    constructor(
      node: NodeViewConstructorArgs[0],
      public view: NodeViewConstructorArgs[1],
      public getPos: NodeViewConstructorArgs[2]
    ) {
      this.dom.setAttribute("data-dom", "true");

      if (editable) {
        this.contentDOM = document.createElement("div");
        this.contentDOM.setAttribute("data-contentDOM", "true");
        this.contentDOM.style.display = "none";
        this.dom.appendChild(this.contentDOM);
      }

      this.target.setAttribute("data-target", "true");

      this.dom.appendChild(this.target);

      this.update(node);
    }

    update(node: any) {
      if (node) {
        if (node.type.name === name) {
          replacePortal(
            this.target,
            this.target,
            <RemoteBlock
              url={url}
              {...node.attrs}
              {...(editable
                ? {
                    editableRef: (node: HTMLElement) => {
                      if (
                        this.contentDOM &&
                        node &&
                        !node.contains(this.contentDOM)
                      ) {
                        node.appendChild(this.contentDOM);
                        this.contentDOM.style.display = "";
                      }
                    },
                  }
                : {})}
            />
          );

          return true;
        }
      }

      return false;
    }

    destroy() {
      this.dom.remove();
      replacePortal(this.target, null, null);
    }

    // @todo type this
    stopEvent(evt: any) {
      if (evt.type === "dragstart") {
        evt.preventDefault();
      }

      return true;
    }

    ignoreMutation(evt: any) {
      return !(
        !evt.target ||
        (evt.target !== this.contentDOM &&
          this.contentDOM?.contains(evt.target))
      );
    }
  };

  // Attempt to improve debugging by giving the node view class a dynamic name
  Object.defineProperty(nodeView, "name", { value: `${name}View` });

  return nodeView;
};
