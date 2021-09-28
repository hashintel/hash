import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { BlockEntity } from "./types";

export type EntityNode = Omit<ProsemirrorNode<Schema>, "attrs"> & {
  attrs: {
    entityId: string | null;
  };
};

export const nodeToComponentId = (node: ProsemirrorNode<Schema>) =>
  node.type.name;

/**
 * @todo this can't look at attrs because we're going to remove entityId from it
 */
export const isEntityNode = (node: ProsemirrorNode<any>): node is EntityNode =>
  !!node.type.spec.attrs && "entityId" in node.type.spec.attrs;

export const findEntityNodes = (doc: ProsemirrorNode<any>) => {
  const entityNodes: [EntityNode, number][] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === "block") {
      return true;
    }

    if (isEntityNode(node)) {
      entityNodes.push([node, pos]);
    }

    return false;
  });

  return entityNodes;
};

export const entityIdExists = (entities: BlockEntity[]) => {
  const ids = new Set(entities.map((block) => block.metadataId));

  return (entityId: string | null): entityId is string =>
    !!entityId && ids.has(entityId);
};
