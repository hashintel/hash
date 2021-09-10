import React from "react";
import { Decoration, EditorView, NodeView } from "prosemirror-view";
import { RemoteBlock } from "../../components/RemoteBlock/RemoteBlock";
import {
  Block,
  cachedPropertiesByEntity,
  mapEntityToBlock,
  ReplacePortals,
} from "@hashintel/hash-shared/sharedWithBackend";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EntityListContext } from "./EntityListContext";
import { EntityListType } from "@hashintel/hash-shared/entityList";
import { PageFieldsFragment } from "@hashintel/hash-shared/graphql/apiTypes.gen";

type NodeViewConstructor = {
  new (
    node: ProsemirrorNode,
    view: EditorView<Schema>,
    getPos: () => number,
    decorations: Decoration[]
  ): NodeView;
};

type NodeViewConstructorArgs = ConstructorParameters<NodeViewConstructor>;

/**
 * @todo clean up / inline this function
 */
const prepareNodeForReact = (entity: EntityListType, node: ProsemirrorNode) => {
  // @todo if this isn't a block we've ran into a biiiiiiig problem – we should error
  const prepared =
    entity && "properties" in entity
      ? ((entity: PageFieldsFragment["properties"]["contents"][number]) => {
          const block = mapEntityToBlock(entity);

          const {
            children,
            childEntityId = null,
            childEntityAccountId = null,
            childEntityTypeId = null,
            childEntityVersionId = null,
            ...props
          } = block.entity;

          const attrs = {
            entityId: block.entityId,
            accountId: block.accountId,
            versionId: block.versionId,
            childEntityId,
            childEntityAccountId,
            childEntityTypeId,
            childEntityVersionId,
            // @ts-ignore
            originalEntity: block.originalEntity,
          };

          return { children, props, attrs };
        })(entity)
      : { attrs: {}, props: {} };

  // @todo fix this
  // @ts-ignore
  prepared.attrs.meta = node.attrs.meta;
  // @ts-ignore
  prepared.attrs.properties = {
    ...(cachedPropertiesByEntity[entity.metadataId] ?? {}),
    ...prepared.props,
  };

  if ("originalEntity" in prepared.attrs) {
    delete prepared.attrs.originalEntity;
  }

  return prepared;
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

            <EntityListContext.Consumer>
              {(entityList) => {
                // @todo fix this
                const entityId = node.attrs.entityId;
                // @todo i think we want a version of this that only has blocks in
                const entity = entityList[entityId];
                const prepared = prepareNodeForReact(entity, node);

                // @todo we need to type this such that we're certain we're passing through all the props required
                return (
                  <RemoteBlock
                    url={url}
                    {...prepared.attrs}
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
              }}
            </EntityListContext.Consumer>
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

export const collabEnabled =
  typeof window !== "undefined" && window.location.search.includes("collab");
