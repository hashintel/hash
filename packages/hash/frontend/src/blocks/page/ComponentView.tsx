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
import memoizeOne from "memoize-one";
import { Schema } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { BlockLoader } from "../../components/BlockLoader/BlockLoader";
import { RenderPortal } from "./usePortals";

// @todo we need to type this such that we're certain we're passing through all
// the props required
const getRemoteBlockProps = (
  entity: EntityStoreType | null | undefined,
  editableRef: unknown,
  fallbackAccountId: string,
): {
  accountId: string;
  // @todo type this
  properties: unknown;
  childEntityId?: string;
  // @todo type this
  editableRef: unknown;
} => {
  if (entity) {
    if (!isBlockEntity(entity)) {
      throw new Error("Cannot prepare non-block entity for prosemirrior");
    }

    const childEntity = entity.properties.entity;

    return {
      accountId: childEntity.accountId,
      childEntityId: childEntity.entityId,
      properties: "properties" in childEntity ? childEntity.properties : {},
      editableRef,
    };
  }

  return { accountId: fallbackAccountId, properties: {}, editableRef };
};

/**
 * @sync `componentViewTargetSelector`
 * @returns a target-/mount-node for a ComponentView instance
 */
const createComponentViewTarget = () => {
  const el = document.createElement("div");
  el.setAttribute("data-target", "true");
  return el;
};

/**
 * used to match target-/mount-nodes of ComponentView instances
 * @sync `createComponentViewTarget`
 */
export const componentViewTargetSelector = "div[data-target=true]";

export class ComponentView implements NodeView<Schema> {
  dom: HTMLDivElement = document.createElement("div");
  contentDOM: HTMLElement | undefined = undefined;
  editable: boolean;

  private target = createComponentViewTarget();

  private readonly componentId: string;
  private readonly sourceName: string;

  private store: EntityStore;
  private unsubscribe: Function;

  getBlockProps = memoizeOne(
    (entity: EntityStoreType, fallbackAccountId: string, editable: boolean) => {
      return getRemoteBlockProps(
        entity,
        editable ? this.editableRef : undefined,
        fallbackAccountId,
      );
    },
  );

  constructor(
    private node: ProsemirrorNode<Schema>,
    public view: EditorView<Schema>,
    public getPos: () => number,
    private renderPortal: RenderPortal,
    private meta: BlockMeta,
    public accountId: string,
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
      const remoteBlockProps = this.getBlockProps(
        entity,
        this.accountId,
        this.editable,
      );

      const mappedUrl = componentIdToUrl(this.componentId);

      /** used by collaborative editing feature `FocusTracker` */
      this.target.setAttribute("data-entity-id", entityId);
      this.renderPortal(
        <BlockLoader
          sourceUrl={`${mappedUrl}/${this.sourceName}`}
          entityId={entityId}
          shouldSandbox={!remoteBlockProps.editableRef}
          blockProperties={remoteBlockProps}
        />,
        this.target,
      );

      return true;
    } else {
      return false;
    }
  }

  editableRef = (editableNode: HTMLElement) => {
    if (
      this.contentDOM &&
      editableNode &&
      !editableNode.contains(this.contentDOM)
    ) {
      editableNode.appendChild(this.contentDOM);
      this.contentDOM.style.display = "";
    }
  };

  destroy() {
    this.dom.remove();
    this.renderPortal(null, this.target);
    this.unsubscribe();
  }

  stopEvent(event: Event) {
    if (event.type === "dragstart") {
      event.preventDefault();
    }

    return !blockComponentRequiresText(this.meta.componentSchema);
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
