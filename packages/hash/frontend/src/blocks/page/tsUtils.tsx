import React from "react";
import { Decoration, EditorView, NodeView } from "prosemirror-view";
import { RemoteBlock } from "../../components/RemoteBlock/RemoteBlock";
import {
  Block,
  cachedPropertiesByEntity,
  ReplacePortals,
} from "@hashintel/hash-shared/sharedWithBackend";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EntityListContext } from "./EntityListContext";
import { EntityListType } from "@hashintel/hash-shared/entityList";

type NodeViewConstructor = {
  new (
    node: ProsemirrorNode,
    view: EditorView<Schema>,
    getPos: () => number,
    decorations: Decoration[]
  ): NodeView;
};

type NodeViewConstructorArgs = ConstructorParameters<NodeViewConstructor>;

const getRemoteBlockProps = (entity: EntityListType | null | undefined) => {
  if (entity) {
    if (!("properties" in entity) || entity.__typename !== "Block") {
      throw new Error("Cannot prepare non-block entity for prosemirrior");
    }

    const childEntity = entity.properties.entity;

    return {
      entityId: entity.id,
      accountId: entity.accountId,
      versionId: entity.id,
      childEntityId: childEntity.metadataId,
      properties:
        childEntity.__typename === "UnknownEntity"
          ? childEntity.unknownProperties
          : {},
    };
  }

  return { properties: {} };
};

/**
 * @todo make this unnecessary
 */
const getOverwrittenRemoteBlockProps = (
  entity: EntityListType | null | undefined,
  node: any
) => {
  const originalProps = getRemoteBlockProps(entity);

  // @todo we need to type this such that we're certain we're passing through all the props required
  return {
    ...originalProps,
    meta: node.attrs.meta,
    properties: {
      ...((entity ? cachedPropertiesByEntity[entity.metadataId] : null) ?? {}),
      ...originalProps.properties,
    },
  };
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
                const entityId = node.attrs.entityId;
                const entity = entityList[entityId];
                const remoteBlockProps = getOverwrittenRemoteBlockProps(
                  entity,
                  node
                );

                return (
                  <RemoteBlock
                    url={url}
                    {...remoteBlockProps}
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
