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
import { defineNewBlock, renderPM } from "./sandbox";
import { baseSchemaConfig } from "./config";
import {
  Block,
  BlockMeta,
  BlockWithoutMeta,
  componentIdToName,
  ReplacePortals,
} from "./tsUtils";

type PageBlockProps = {
  contents: (Block | BlockWithoutMeta)[];
  blocksMeta: Map<string, BlockMeta>;
};

type PortalSet = Map<HTMLElement, { key: string; reactNode: ReactNode }>;

export const PageBlock: VoidFunctionComponent<PageBlockProps> = ({
  contents,
  blocksMeta,
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

  useEffect(() => {
    const schema = new Schema(baseSchemaConfig);

    const view = renderPM(
      root.current!,
      schema.node(
        "doc",
        {},
        contents?.map((block) => {
          const { children, ...props } = block.entity;

          return schema.node(
            "async",
            {
              autofocus: false,
              asyncNodeUrl: block.componentId,
              asyncNodeProps: {
                attrs: {
                  props,
                  entityId: block.entityId,
                  // @todo set this properly
                  childEntityId: children?.[0]?.entityId ?? null,
                },
                children:
                  children?.map((child: any) => {
                    if (child.type === "text") {
                      return schema.text(
                        child.text,
                        child.marks.map((mark: string) => schema.mark(mark))
                      );
                    }

                    // @todo recursive nodes
                    throw new Error("unrecognised child");
                  }) ?? [],
              },
            },
            []
          );
        }) ?? []
      ),
      { nodeViews: {} },
      replacePortal,
      [
        // new Plugin({
        //   props: {
        //     handleDOMEvents: {
        //       blur(view, evt) {
        //         console.log(
        //           view.state
        //             .toJSON()
        //             .doc.content.filter((block) => block.type === "block")
        //             .flatMap((block) =>
        //               block.content.map((node) => {
        //                 const nodeType = view.state.schema.nodes[node.type];
        //                 const meta = nodeType.defaultAttrs.meta;
        //
        //                 const componentId = meta.url;
        //
        //                 console.log(node);
        //
        //                 return {
        //                   id: node.attrs.entityId,
        //                   properties: {
        //                     componentId,
        //                     entityType: node.attrs.childEntityId
        //                       ? "Text"
        //                       : "UnknownEntity",
        //                     entity: node.attrs.childEntityId ? {} : null,
        //                   },
        //                 };
        //               })
        //             )
        //         );
        //
        //         return false;
        //       },
        //     },
        //   },
        // }),
      ]
    );

    for (const [url, meta] of Array.from(blocksMeta.entries())) {
      defineNewBlock(
        meta.componentMetadata,
        meta.componentSchema,
        view,
        componentIdToName(url),
        replacePortal
      );
    }

    const node = root.current!;

    return () => {
      node.innerHTML = "";
    };
  }, [contents]);

  return (
    <>
      <div id="root" ref={root} />
      {Array.from(portals.entries()).map(([target, { key, reactNode }]) => (
        <Fragment key={key}>{createPortal(reactNode, target)}</Fragment>
      ))}
    </>
  );
};
