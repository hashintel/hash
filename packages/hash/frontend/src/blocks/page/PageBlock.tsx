import React, { useLayoutEffect, useRef, VoidFunctionComponent } from "react";
import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { defineNewBlock, defineRemoteBlock, renderPM } from "./sandbox";
import { baseSchemaConfig } from "./config";
import {
  Block,
  BlockMeta,
  blockPaths,
  BlockWithoutMeta,
  componentIdToName,
} from "./tsUtils";
import { useBlockProtocolUpdate } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { BlockProtocolUpdatePayload } from "../../types/blockProtocol";
import { useBlockProtocolInsertIntoPage } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolInsertIntoPage";
import { usePortals } from "./usePortals";
import { useDeferredCallback } from "./useDeferredCallback";

const invertedBlockPaths = Object.fromEntries(
  Object.entries(blockPaths).map(([key, value]) => [value, key])
);

type PageBlockProps = {
  contents: (Block | BlockWithoutMeta)[];
  blocksMeta: Map<string, BlockMeta>;
  pageId: string;
  namespaceId: string;
};

export const PageBlock: VoidFunctionComponent<PageBlockProps> = ({
  contents,
  blocksMeta,
  pageId,
  namespaceId,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const { insert } = useBlockProtocolInsertIntoPage();
  const { update } = useBlockProtocolUpdate();

  const [portals, replacePortal] = usePortals();
  const [deferCallback, clearCallback] = useDeferredCallback();

  const prosemirrorSetup =
    useRef<null | { view: EditorView; schema: Schema }>(null);

  const currentContents = useRef(contents);
  useLayoutEffect(() => {
    currentContents.current = contents;
  });

  useLayoutEffect(() => {
    const node = root.current!;
    const schema = new Schema(baseSchemaConfig);

    /**
     * Setting this function to global state as a shortcut to call it from deep within prosemirror
     *
     * @todo come up with a better solution for this
     */
    (window as any).triggerSave = () => {
      /**
       * In order to save, we first need to map the current prosemirror document back to something that looks more like
       * the contents we were passed
       */
      const contents = currentContents.current;

      const blocks = view.state
        .toJSON()
        .doc.content.filter((block: any) => block.type === "block")
        .flatMap((block: any) => block.content) as any[];

      const seenEntityIds = new Set<string>();

      const mappedBlocks = blocks.map((node: any, position) => {
        const nodeType = view.state.schema.nodes[node.type];
        const meta = nodeType.defaultAttrs.meta;

        const componentId = invertedBlockPaths[meta.url] ?? meta.url;

        let entity;
        if (schema.nodes[node.type].isTextblock) {
          entity = {
            type: "Text",
            id: node.attrs.childEntityId,
            namespaceId: node.attrs.childEntityNamespaceId,
            properties: {
              texts:
                node.content
                  ?.filter((child: any) => child.type === "text")
                  .map((child: any) => ({
                    text: child.text,
                    bold:
                      child.marks?.some(
                        (mark: any) => mark.type === "strong"
                      ) ?? false,
                    italics:
                      child.marks?.some((mark: any) => mark.type === "em") ??
                      false,
                    underline:
                      child.marks?.some(
                        (mark: any) => mark.type === "underlined"
                      ) ?? false,
                  })) ?? [],
            },
          };
        } else {
          const { childEntityId, childEntityNamespaceId, ...props } =
            node.attrs;
          entity = {
            type: "UnknownEntity",
            id: childEntityId,
            namespaceId: childEntityNamespaceId,
            properties: props,
          };
        }

        const block = {
          entityId: node.attrs.entityId,
          namespaceId: node.attrs.namespaceId ?? namespaceId,
          type: "Block",
          position,
          properties: {
            componentId,
            entity,
          },
        };

        if (seenEntityIds.has(block.entityId)) {
          block.entityId = null;
          entity.id = null;
        }

        seenEntityIds.add(block.entityId);

        return block;
      });

      const newBlocks = mappedBlocks.filter(
        (block) =>
          !contents.some((content) => content.entityId === block.entityId)
      );

      const existingBlocks = mappedBlocks.filter((block) =>
        contents.some((content) => content.entityId === block.entityId)
      );

      const updatedEntities = existingBlocks.flatMap((node) => {
        const block = {
          type: "Block",
          id: node.entityId,
          namespaceId: node.namespaceId,
          properties: {
            componentId: node.properties.componentId,
            entityType: node.properties.entity.type,
            entityId: node.properties.entity.id,
            namespaceId: node.properties.entity.namespaceId,
          },
        };

        const contentNode = contents.find((c) => c.entityId === block.id);

        const blocks = [];

        if (block.properties.componentId !== contentNode?.componentId) {
          blocks.push(block);
        }

        if (node.properties.entity.type === "Text") {
          if (
            !contentNode ||
            contentNode.entity.childEntityId !== node.properties.entity.id ||
            (node.properties.entity.properties.texts as any[]).some(
              (text: any, idx: number) => {
                const contentText = contentNode.entity.children[idx];

                return (
                  !contentText ||
                  text.text !== contentText.text ||
                  text.bold !== contentText.marks?.includes("strong") ||
                  text.underline !==
                    contentText.marks?.includes("underlined") ||
                  text.italics !== contentText.marks?.includes("em")
                );
              }
            )
          ) {
            blocks.push(node.properties.entity);
          }
        }

        //
        // blocks.push(entity);

        // if (
        //   entity.type !== "Text" ||
        //   JSON.stringify(entity.properties.textProperties.texts) ===
        //     JSON.stringify(contentNode.entity.textPro)
        // )
        return blocks;
      });

      const pageBlocks = existingBlocks.map((node) => {
        return {
          entityId: node.entityId,
          namespaceId: node.namespaceId,
          type: "Block",
        };
      });

      const blockIdsChange =
        JSON.stringify(contents.map((content) => content.entityId)) !==
        JSON.stringify(mappedBlocks.map((block) => block.entityId));

      newBlocks
        .reduce(
          (promise, newBlock) =>
            promise
              .catch(() => {})
              .then(() => {
                // @todo this should take the user id of whoever creates it
                insert({
                  pageId,
                  entityType: newBlock.properties.entity.type,
                  position: newBlock.position,
                  componentId: newBlock.properties.componentId,
                  entityProperties: newBlock.properties.entity.properties,
                  namespaceId: namespaceId,
                });
              }),
          blockIdsChange
            ? update([
                {
                  entityType: "Page",
                  entityId: pageId,
                  namespaceId,
                  data: {
                    contents: pageBlocks,
                  },
                },
              ])
            : Promise.resolve()
        )
        .then(() => {
          return update([
            ...updatedEntities
              .filter(
                (entity) =>
                  (entity.properties.entityType !== "Text" ||
                    entity.properties.entityId) &&
                  entity.id
              )
              .map(
                (entity): BlockProtocolUpdatePayload<any> => ({
                  entityId: entity.id,
                  entityType: entity.type,
                  data: entity.properties,
                  namespaceId: entity.namespaceId,
                })
              ),
          ]);
        });
    };

    const savePlugin = new Plugin({
      props: {
        handleDOMEvents: {
          keydown(view, evt) {
            if (evt.key === "s" && evt.metaKey) {
              evt.preventDefault();
              (window as any).triggerSave?.();

              return true;
            }
            return false;
          },
          focus() {
            clearCallback();
            return false;
          },
          blur: function () {
            deferCallback(() => (window as any).triggerSave());

            return false;
          },
        },
      },
    });

    const view = renderPM(
      node,
      schema.node("doc", {}, [schema.node("blank")]),
      { nodeViews: {} },
      replacePortal,
      [savePlugin]
    );

    prosemirrorSetup.current = { schema, view };

    return () => {
      // @todo how does this work with portals?
      node.innerHTML = "";
      prosemirrorSetup.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (!prosemirrorSetup.current) {
      return;
    }

    const { view } = prosemirrorSetup.current;
    for (const [url, meta] of Array.from(blocksMeta.entries())) {
      defineNewBlock(
        meta.componentMetadata,
        meta.componentSchema,
        view,
        componentIdToName(url),
        replacePortal
      );
    }
  }, [blocksMeta]);

  useLayoutEffect(() => {
    if (!prosemirrorSetup.current) {
      return;
    }

    const { view, schema } = prosemirrorSetup.current;

    // @todo support cancelling this
    (async () => {
      const { tr } = view.state;

      const newNodes = await Promise.all(
        contents?.map(async (block) => {
          const {
              children,
              childEntityId = null,
              childEntityNamespaceId = null,
              ...props
            } = block.entity;

          const id = componentIdToName(block.componentId);

          return await defineRemoteBlock(
            view,
            block.componentId,
            id,
            replacePortal,
            {
              props,
              entityId: block.entityId,
              namespaceId: block.namespaceId,
                    childEntityId,
                    childEntityNamespaceId,
            },
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
            undefined
          );
        }) ?? []
      );

      tr.replaceWith(0, view.state.doc.content.size, newNodes);
      view.dispatch(tr);
    })();
  }, [contents]);

  return (
    <>
      <div id="root" ref={root} />
      {portals}
    </>
  );
};
