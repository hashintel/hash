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

import { defineBlock } from "./utils";
import { createState, defineNewNodeView, renderPM } from "./sandbox";
import { baseSchemaConfig } from "./config";
import {
  Block,
  componentIdToName,
  createNodeView,
  ReplacePortals,
} from "./tsUtils";

type PageBlockProps = {
  contents: Block[] | null;
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

    if (contents) {
      for (const block of contents) {
        const name = componentIdToName(block.componentId);

        if (schema.nodes[name]) {
          continue;
        }
        const NodeViewClass = createNodeView(
          name,
          block.componentSchema,
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
          block.componentMetadata.name,
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
    }

    window.view = view;

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
