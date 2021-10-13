import {
  Block,
  blockComponentRequiresText,
  componentIdToUrl,
} from "@hashintel/hash-shared/blockMeta";
import {
  EntityStoreType,
  isBlockEntity,
} from "@hashintel/hash-shared/entityStore";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import React from "react";
import { RemoteBlock } from "../../components/RemoteBlock/RemoteBlock";
import { EntityStoreContext } from "./EntityStoreContext";
import { ReplacePortal } from "./usePortals";

// @todo we need to type this such that we're certain we're passing through all
// the props required
const getRemoteBlockProps = (entity: EntityStoreType | null | undefined) => {
  if (entity) {
    if (!isBlockEntity(entity)) {
      throw new Error("Cannot prepare non-block entity for prosemirrior");
    }

    const childEntity = entity.properties.entity;

    return {
      accountId: childEntity.accountId,
      childEntityId: childEntity.entityId,
      properties: "properties" in childEntity ? childEntity.properties : {},
    };
  }

  return { properties: {} };
};

export class ComponentNodeView implements NodeView {
  dom: HTMLDivElement = document.createElement("div");
  contentDOM: HTMLElement | undefined = undefined;
  editable: boolean;

  private target = document.createElement("div");

  constructor(
    node: ProsemirrorNode,
    public view: EditorView<Schema>,
    public getPos: () => number,
    private componentId: string,
    componentSchema: Block["componentSchema"],
    private sourceName: string,
    private replacePortal: ReplacePortal
  ) {
    this.dom.setAttribute("data-dom", "true");

    this.editable = blockComponentRequiresText(componentSchema);

    if (this.editable) {
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
    if (node?.type.name === this.componentId) {
      this.replacePortal(
        this.target,
        this.target,
        <EntityStoreContext.Consumer>
          {(entityStore) => {
            const entityId = node.attrs.entityId;
            const entity = entityStore[entityId];
            const remoteBlockProps = getRemoteBlockProps(entity);

            const editableRef = this.editable
              ? (editableNode: HTMLElement) => {
                  if (
                    this.contentDOM &&
                    editableNode &&
                    !editableNode.contains(this.contentDOM)
                  ) {
                    editableNode.appendChild(this.contentDOM);
                    this.contentDOM.style.display = "";
                  }
                }
              : undefined;

            const mappedUrl = componentIdToUrl(this.componentId);

            return (
              <RemoteBlock
                {...remoteBlockProps}
                url={`${mappedUrl}/${this.sourceName}`}
                editableRef={editableRef}
              />
            );
          }}
        </EntityStoreContext.Consumer>
      );

      return true;
    } else {
      return false;
    }
  }

  destroy() {
    this.dom.remove();
    this.replacePortal(this.target, null, null);
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
      (evt.target !== this.contentDOM && this.contentDOM?.contains(evt.target))
    );
  }
}
