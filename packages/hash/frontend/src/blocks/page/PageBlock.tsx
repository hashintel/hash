import React, {
  Fragment,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import { createPortal } from "react-dom";
import { v4 as uuid } from "uuid";
import { Schema } from "prosemirror-model";
import { EditorProps, NodeView } from "prosemirror-view";
import { Schema as JSONSchema } from "jsonschema";

import { defineBlock } from "./utils";
import { createState, defineNewNodeView, renderPM } from "./sandbox";
import { RemoteBlock } from "../../components/RemoteBlock/RemoteBlock";
import { baseSchemaConfig } from "./config";

/**
 * @todo this API could possibly be simpler
 */
type ReplacePortals = (
  existingNode: HTMLElement | null,
  nextNode: HTMLElement | null,
  reactNode: ReactNode | null
) => void;

// @todo this type properly exists already somewhere
export type Block = {
  entityId: string;
  entity: Record<any, any>;
  componentId: string;
  componentMetadata: {
    source: string;
  };
  componentSchema: JSONSchema;
};

type PageBlockProps = {
  contents: Block[];
};

const componentIdToName = (componentId: string) => {
  const stripped = componentId.replace(/[^a-zA-Z0-9]/g, "");
  return stripped.slice(0, 1).toUpperCase() + stripped.slice(1);
};

export const addBlockMetadata = async (
  block: Omit<Block, "componentMetadata" | "componentSchema">
): Promise<Block> => {
  const metadata = await (
    await fetch(`${block.componentId}/metadata.json`)
  ).json();

  const schema = await (
    await fetch(`${block.componentId}/${metadata.schema}`)
  ).json();

  return { ...block, componentMetadata: metadata, componentSchema: schema };
};

type NodeViewConstructorArgs = Parameters<
  NonNullable<EditorProps["nodeViews"]>[string]
>;
type NodeViewConstructor = {
  new (...args: NodeViewConstructorArgs): NodeView;
};

const createNodeView = (
  name: string,
  block: Block,
  url: string,
  replacePortal: ReplacePortals
): NodeViewConstructor => {
  const editable = block.componentSchema.properties?.["editableRef"];

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
              {...node.attrs.props}
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

  Object.defineProperty(nodeView, "name", { value: `${name}View` });

  return nodeView;
};

type PortalSet = Map<HTMLElement, { key: string; reactNode: ReactNode }>;

export const PageBlock: VoidFunctionComponent<PageBlockProps> = ({
  contents,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const [portals, setPortals] = useState<PortalSet>(new Map());

  const portalQueue = useRef<((set: PortalSet) => void)[]>([]);
  const portalQueueTimeout =
    useRef<ReturnType<typeof setImmediate> | null>(null);

  const replacePortal = useCallback<ReplacePortals>(
    (existingNode, nextNode, reactNode) => {
      if (portalQueueTimeout.current !== null) {
        clearImmediate(portalQueueTimeout.current);
      }

      portalQueue.current.push((nextPortals) => {
        if (existingNode && existingNode !== nextNode) {
          nextPortals.delete(existingNode);
        }

        if (nextNode && reactNode) {
          const key = nextPortals.get(nextNode)?.key ?? uuid();

          nextPortals.set(nextNode, { key, reactNode });
        }
      });

      portalQueueTimeout.current = setImmediate(() => {
        const queue = portalQueue.current;
        portalQueue.current = [];

        setPortals((portals) => {
          const nextPortals = new Map(portals);

          for (const cb of queue) {
            cb(nextPortals);
          }

          return nextPortals;
        });
      });
    },
    []
  );

  useEffect(() => {
    return () => {
      if (portalQueueTimeout.current !== null) {
        clearImmediate(portalQueueTimeout.current);
      }
    };
  }, []);

  // @todo needs to respond to changes to contents
  useEffect(() => {
    const schema = new Schema(baseSchemaConfig);

    const view = renderPM(
      root.current!,
      // @todo come up with an easier way to create a blank state to start with
      schema.node("doc", {}, [
        schema.node("block", {}, [schema.node("paragraph", {}, [])]),
      ]),
      { nodeViews: {} },
      replacePortal
    );

    for (const block of contents) {
      const name = componentIdToName(block.componentId);

      if (schema.nodes[name]) {
        continue;
      }
      const NodeViewClass = createNodeView(
        name,
        block,
        `${block.componentId}/${block.componentMetadata.source}`,
        replacePortal
      );
      const spec = defineBlock({
        attrs: {
          props: { default: {} },
          meta: { default: block.componentMetadata },
        },
        ...(block.componentSchema.properties?.["editableRef"]
          ? {
              // @todo infer this somehow
              content: "text*",
              marks: "",
            }
          : {}),
      });

      defineNewNodeView(
        view,
        name,
        spec,
        (node: any, view: any, getPos: any, decorations: any) =>
          new NodeViewClass(node, view, getPos, decorations)
      );
    }

    const mappedContents = contents.map((block) => {
      const { children, ...props } = block.entity;

      return schema.node("block", {}, [
        schema.node(
          componentIdToName(block.componentId),
          { props, meta: block.componentMetadata },
          children?.map((child: any) => {
            if (child.type === "text") {
              return schema.text(child.text);
            }

            // @todo recursive nodes
            throw new Error("unrecognised child");
          }) ?? []
        ),
      ]);
    });

    view.setProps({
      state: createState(schema.node("doc", {}, mappedContents)),
    });

    const node = root.current!;

    return () => {
      node.innerHTML = "";
    };
  }, []);

  return (
    <>
      <div id="root" ref={root} />
      {Array.from(portals.entries()).map(([target, { key, reactNode }]) => (
        <Fragment key={key}>{createPortal(reactNode, target)}</Fragment>
      ))}
    </>
  );
};
