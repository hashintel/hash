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
import {
  defineNewBlock,
  defineNewNode,
  defineNewProsemirrorNode,
  renderPM,
} from "./sandbox";
import { baseSchemaConfig } from "./config";
import {
  Block,
  BlockMeta,
  componentIdToName,
  fetchBlockMeta,
  ReplacePortals,
} from "./tsUtils";

type PageBlockProps = {
  contents: Block[];
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
              asyncNodeDisplayName: block.componentMetadata.name,
              asyncNodeProps: {
                attrs: {
                  props,
                  meta: block.componentMetadata,
                },
                children:
                  children?.map((child: any) => {
                    if (child.type === "text") {
                      return schema.text(child.text);
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
      replacePortal
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

    window.view = view;

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
