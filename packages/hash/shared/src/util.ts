import { Schema } from "prosemirror-model";
import { BlockEntity } from "./entity";
import { ProsemirrorNode } from "./node";

// @todo move these functions to a more appropriate place

export type EntityNode = Omit<ProsemirrorNode<Schema>, "attrs"> & {
  attrs: {
    entityId: string | null;
  };
};

/**
 * @deprecated
 * @todo remove this – get this from entity store instead – this will rely
 * on having a draft entity store
 */
export const nodeToComponentId = (node: ProsemirrorNode<Schema>) =>
  node.type.name;

/**
 * @todo this can't look at attrs because we're going to remove entityId from it
 */
export const isEntityNode = (
  node: ProsemirrorNode<Schema>
): node is EntityNode =>
  !!node.type.spec.attrs &&
  "entityId" in node.type.spec.attrs &&
  // This is temporary because we've added a new entity PM node but we're not
  // yet using it for update calculation
  node.type.name !== "entity";

export const findEntityNodes = (doc: ProsemirrorNode<Schema>) => {
  const entityNodes: [EntityNode, number][] = [];

  doc.descendants((node, pos) => {
    if (isEntityNode(node)) {
      entityNodes.push([node, pos]);
    }

    return true;
  });

  return entityNodes;
};

export const entityIdExists = (entities: BlockEntity[]) => {
  const ids = new Set(entities.map((block) => block.entityId));

  return (entityId: string | null): entityId is string =>
    !!entityId && ids.has(entityId);
};
