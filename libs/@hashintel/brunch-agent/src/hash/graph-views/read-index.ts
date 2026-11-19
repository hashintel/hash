import { oneLine, type ReadEntity } from "./naming";

/** Lookups every entity view builds over one read: by id, and links by endpoint. */
import type { HashEntityReadResult } from "../graph-reads";

export const groupBy = <Item>(
  items: readonly Item[],
  keyOf: (item: Item) => string,
) => {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
};

export const cutShort = (text: string, maxLength: number) =>
  text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;

export const readIndex = (result: HashEntityReadResult) => {
  const byId = new Map(
    result.entities.map((entity) => [entity.entityId, entity]),
  );
  const links = result.entities.filter(
    (entity) => entity.linkData !== undefined,
  );
  return {
    byId,
    linksFrom: groupBy(links, (link) => link.linkData!.leftEntityId),
    linksTo: groupBy(links, (link) => link.linkData!.rightEntityId),
    links,
    /** An entity by id, with its label when the read holds it. */
    ref: (entityId: string) => {
      const label = byId.get(entityId)?.label;
      return {
        id: entityId,
        label: label === undefined ? null : cutShort(oneLine(label), 80),
      };
    },
  };
};

/** A link with no properties of its own is a relationship, shown on its endpoints. */
export const isBareLink = (entity: ReadEntity) =>
  entity.linkData !== undefined && Object.keys(entity.properties).length === 0;
