import { expect, test } from "vitest";

import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";

import { generateGraphFixture } from "./generate-fixture";

const params = {
  entityCount: 40,
  entityTypeCount: 4,
  linkDensity: 1.5,
  rootFraction: 0.6,
  hubCount: 3,
  seed: 12345,
} as const;

test("the produced root map resolves every entity via getClosedMultiEntityTypeFromMap", () => {
  const { entities, closedMultiEntityTypesRootMap } =
    generateGraphFixture(params);

  for (const entity of entities) {
    expect(() =>
      getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypesRootMap,
        entity.metadata.entityTypeIds,
      ),
    ).not.toThrow();
  }
});

test("a generated entity yields a non-empty label and an emoji icon", () => {
  const { entities, closedMultiEntityTypesRootMap } =
    generateGraphFixture(params);

  const node = entities.find((entity) => entity.linkData === undefined);
  expect(node).toBeDefined();

  const closedType = getClosedMultiEntityTypeFromMap(
    closedMultiEntityTypesRootMap,
    node!.metadata.entityTypeIds,
  );

  const label = generateEntityLabel(closedType, node!);
  expect(label.length).toBeGreaterThan(0);
  // The label resolves via the type's labelProperty, not the entity-type-title fallback.
  expect(label).not.toMatch(/^Entity/);

  const { icon, labelProperty } =
    getDisplayFieldsForClosedEntityType(closedType);
  expect(typeof icon).toBe("string");
  expect(icon?.length ?? 0).toBeGreaterThan(0);
  expect(labelProperty).toBeDefined();
});

test("regenerate with the same seed reproduces the same graph", () => {
  const first = generateGraphFixture(params);
  const second = generateGraphFixture(params);

  expect(first.entities.map((entity) => entity.entityId)).toEqual(
    second.entities.map((entity) => entity.entityId),
  );
  expect(first.rootEntityIds).toEqual(second.rootEntityIds);
});

test("hubs emerge: a few nodes carry far more incident links than the median", () => {
  const { entities } = generateGraphFixture({ ...params, hubCount: 3 });

  const degree = new Map<string, number>();
  for (const entity of entities) {
    const { linkData } = entity;
    if (!linkData) {
      continue;
    }
    degree.set(
      linkData.leftEntityId,
      (degree.get(linkData.leftEntityId) ?? 0) + 1,
    );
    degree.set(
      linkData.rightEntityId,
      (degree.get(linkData.rightEntityId) ?? 0) + 1,
    );
  }

  const degrees = [...degree.values()].sort((a, b) => b - a);
  expect(degrees.length).toBeGreaterThan(0);
  const maxDegree = degrees[0]!;
  const median = degrees[Math.floor(degrees.length / 2)] ?? 0;
  expect(maxDegree).toBeGreaterThan(median);
});
