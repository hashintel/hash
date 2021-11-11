import {
  blockComponentRequiresText,
  BlockMeta,
  componentIdToUrl,
} from "@hashintel/hash-shared/blockMeta";
import {
  EntityStore,
  EntityStoreType,
  isBlockEntity,
} from "@hashintel/hash-shared/entityStore";
import {
  entityStoreFromProsemirror,
  subscribeToEntityStore,
} from "@hashintel/hash-shared/entityStorePlugin";
import { ProsemirrorNode } from "@hashintel/hash-shared/node";
import { Schema } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { BlockLoader } from "../../components/BlockLoader/BlockLoader";
import { RenderPortal } from "./usePortals";

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

export class ComponentView implements NodeView<Schema> {
  dom: HTMLDivElement = document.createElement("div");
  contentDOM: HTMLElement | undefined = undefined;
  editable: boolean;

  private target = document.createElement("div");

  private readonly componentId: string;
  private readonly sourceName: string;

  private store: EntityStore;
  private unsubscribe: Function;

  constructor(
    private node: ProsemirrorNode<Schema>,
    public view: EditorView<Schema>,
    public getPos: () => number,
    private renderPortal: RenderPortal,
    private meta: BlockMeta,
  ) {
    const { componentMetadata, componentSchema } = meta;
    const { source } = componentMetadata;

    if (!source) {
      throw new Error("Cannot create new block for component missing a source");
    }

    this.sourceName = source;
    this.componentId = componentMetadata.componentId;

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

    this.store = entityStoreFromProsemirror(view.state).store;
    this.unsubscribe = subscribeToEntityStore(this.view, (store) => {
      this.store = store;
      this.update(this.node);
    });

    this.update(this.node);
  }

  update(node: any) {
    this.node = node;

    if (node?.type.name === this.componentId) {
      const entityId = node.attrs.blockEntityId;
      const entity = this.store.saved[entityId];
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

      this.renderPortal(
        <BlockLoader
          {...remoteBlockProps}
          sourceUrl={`${mappedUrl}/${this.sourceName}`}
          editableRef={editableRef}
          shouldSandbox={!editableRef}
        />,
        this.target,
      );

      return true;
    } else {
      return false;
    }
  }

  destroy() {
    this.dom.remove();
    this.renderPortal(null, this.target);
    this.unsubscribe();
  }

  stopEvent(event: Event) {
    if (event.type === "dragstart") {
      event.preventDefault();
    }

    return true;
  }

  // This condition is designed to check that the event isn’t coming from React-handled code.
  // Not doing so leads to cycles of mutation records.
  ignoreMutation(
    event:
      | MutationRecord
      | {
          type: "selection";
          target: Element;
        },
  ) {
    // We still want ProseMirror to know about all selection events to track cursor moves
    if (event.type === "selection") {
      return false;
    }

    const targetIsInsideContentDOM =
      this.contentDOM?.contains(event.target) &&
      event.target !== this.contentDOM;

    const eventIsHandledByReact = !targetIsInsideContentDOM;

    return eventIsHandledByReact;
  }
}
