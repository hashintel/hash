/**
 * The survey: what kinds of entities a web holds, how many of each, and which
 * kinds link to which. It lists no entities, so its size depends on the number
 * of types, never on the number of entities.
 */
import * as v from "valibot";

import { oneLine, typeNamer } from "./naming";

const typeIdsSchema = v.array(v.string());

/**
 * What a survey is computed from: counts over every entity the read covers,
 * not a sample. HASH's page has no single read for this yet; its
 * `summarizeEntities` query counts entities by type, but not links by their
 * endpoints' types.
 */
export const hashEntitySurveyResultSchema = v.object({
  webIds: v.array(v.string()),
  entityTypes: v.array(
    v.object({ entityTypeId: v.string(), title: v.string() }),
  ),
  /** Entities that aren't links, counted by their exact set of types. */
  groups: v.array(
    v.object({ entityTypeIds: typeIdsSchema, count: v.number() }),
  ),
  /** Link entities, counted by their own types and their endpoints' types. */
  links: v.array(
    v.object({
      entityTypeIds: typeIdsSchema,
      leftEntityTypeIds: typeIdsSchema,
      rightEntityTypeIds: typeIdsSchema,
      count: v.number(),
      /** How many of them carry properties of their own. */
      withProperties: v.number(),
    }),
  ),
});

export type HashEntitySurveyResult = v.InferOutput<
  typeof hashEntitySurveyResultSchema
>;

export const projectEntitySurvey = (result: HashEntitySurveyResult) => {
  const allTypeIds = [
    ...result.entityTypes.map(({ entityTypeId }) => entityTypeId),
    ...result.groups.flatMap(({ entityTypeIds }) => entityTypeIds),
    ...result.links.flatMap((link) => [
      ...link.entityTypeIds,
      ...link.leftEntityTypeIds,
      ...link.rightEntityTypeIds,
    ]),
  ];
  const typeName = typeNamer(allTypeIds);
  const titleOf = new Map(
    result.entityTypes.map(({ entityTypeId, title }) => [
      entityTypeId,
      oneLine(title),
    ]),
  );
  const key = (entityTypeIds: readonly string[]) =>
    entityTypeIds.length === 0
      ? "outside this web"
      : entityTypeIds.map(typeName).join("+");
  const title = (entityTypeIds: readonly string[]) =>
    entityTypeIds
      .map(
        (entityTypeId) => titleOf.get(entityTypeId) ?? typeName(entityTypeId),
      )
      .join(", ");
  const byCount = <Item extends { count: number }>(items: readonly Item[]) =>
    [...items].sort((left, right) => right.count - left.count);

  return {
    read: {
      view: "survey",
      webs: result.webIds,
      entities: result.groups.reduce((total, { count }) => total + count, 0),
      links: result.links.reduce((total, { count }) => total + count, 0),
    },
    types: byCount(result.groups).map(({ entityTypeIds, count }) => ({
      name: key(entityTypeIds),
      title: title(entityTypeIds),
      count,
    })),
    links: byCount(result.links).map((link) => ({
      name: key(link.entityTypeIds),
      title: title(link.entityTypeIds),
      from: key(link.leftEntityTypeIds),
      to: key(link.rightEntityTypeIds),
      count: link.count,
      withProperties: link.withProperties,
    })),
    legend: {
      types: Object.fromEntries(
        [...new Set(allTypeIds)].map((entityTypeId) => [
          typeName(entityTypeId),
          entityTypeId,
        ]),
      ),
    },
  };
};
