import { Schema } from "prosemirror-model";
import { BlockEntity } from "./entity";
import { ProsemirrorNode } from "./node";

// @todo move these functions to a more appropriate place

export type ComponentNode = Omit<ProsemirrorNode<Schema>, "attrs"> & {
  attrs: {
    blockEntityId: string | null;
  };
};

export type EntityNode = Omit<ProsemirrorNode<Schema>, "attrs"> & {
  attrs: {
    entityId: string | null;
    draftId: string | null;
  };
};

/**
 * @deprecated
 * @todo remove this – get this from entity store instead – this will rely
 * on having a draft entity store
 */
export const nodeToComponentId = (node: ProsemirrorNode<Schema>) =>
  node.type.name;

export const isEntityNode = (
  node: ProsemirrorNode<Schema> | null
): node is EntityNode => !!node && node.type === node.type.schema.nodes.entity;

/**
 * @todo use group name for this
 */
export const isComponentNode = (
  node: ProsemirrorNode<Schema>
): node is ComponentNode =>
  !!node.type.spec.attrs && "blockEntityId" in node.type.spec.attrs;

export const findComponentNodes = (doc: ProsemirrorNode<Schema>) => {
  const componentNodes: [ComponentNode, number][] = [];

  doc.descendants((node, pos) => {
    if (isComponentNode(node)) {
      componentNodes.push([node, pos]);
    }

    return true;
  });

  return componentNodes;
};

export const blockEntityIdExists = (entities: BlockEntity[]) => {
  const ids = new Set(entities.map((block) => block.entityId));

  return (blockEntityId: string | null): blockEntityId is string =>
    !!blockEntityId && ids.has(blockEntityId);
};

// @todo this should be defined elsewhere
export type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;
