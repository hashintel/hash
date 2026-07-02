import { describe, expect, it } from "vitest";

import { entityIdFromComponents } from "@blockprotocol/type-system";

import { ClusterId, EntityIndex, TypeId } from "../../ids";
import { Column } from "../collections/column";
import { ReadonlySortedSet } from "../collections/readonly-sorted-set";
import { ClusterNode } from "../hierarchy/cluster-tree";
import { EntityStore } from "../store/entity";
import { TypeSetStore } from "../store/type-set";
import {
  entityIdsForCluster,
  entityIndicesForCluster,
  frontierCount,
  frontierMembers,
} from "./cluster-membership";

import type { EntityUuid, WebId } from "@blockprotocol/type-system";

const webId = "11111111-1111-4111-8111-111111111111" as WebId;

const entityIdFor = (index: number) =>
  entityIdFromComponents(
    webId,
    `22222222-2222-4222-8222-${index.toString(16).padStart(12, "0")}` as EntityUuid,
  );

/** An entity store holding `count` entities (EntityIndex 0..count-1). */
function entityStoreOf(count: number): EntityStore {
  const entities = new EntityStore();
  for (let index = 0; index < count; index++) {
    entities.insert(entityIdFor(index));
  }
  return entities;
}

function directNode(id: string, memberIdxs: readonly number[]): ClusterNode {
  const members = new Column<Int32Array, EntityIndex>(
    Int32Array,
    Math.max(memberIdxs.length, 1),
  );
  for (const memberIdx of memberIdxs) {
    members.push(EntityIndex(memberIdx));
  }
  const node = new ClusterNode(ClusterId(id), "entity-bucket", {
    source: "direct",
    members,
  });
  node.count = memberIdxs.length;
  return node;
}

/** A type-set store with one group containing the given entities. */
function groupsFixture(memberIdxs: readonly number[]): {
  typeSets: TypeSetStore;
  node: ClusterNode;
} {
  const typeSets = new TypeSetStore();
  const group = typeSets.getOrCreate(
    new ReadonlySortedSet([TypeId(0)], (lhs, rhs) => lhs - rhs),
    4,
  );
  for (const memberIdx of memberIdxs) {
    group.addEntity(EntityIndex(memberIdx));
  }
  const node = new ClusterNode(ClusterId("cluster:groups"), "type-set", {
    source: "groups",
    keys: [group.key],
  });
  node.count = memberIdxs.length;
  return { typeSets, node };
}

describe("entityIndicesForCluster", () => {
  it("yields direct members in packed order", () => {
    const typeSets = new TypeSetStore();
    const node = directNode("cluster:direct", [3, 1, 2]);

    expect([...entityIndicesForCluster(node, typeSets)]).toEqual([3, 1, 2]);
  });

  it("yields group members for group-sourced nodes", () => {
    const { typeSets, node } = groupsFixture([0, 2]);

    expect([...entityIndicesForCluster(node, typeSets)]).toEqual([0, 2]);
  });

  it("recurses into children only when the node has no own entities", () => {
    const typeSets = new TypeSetStore();
    const rollup = new ClusterNode(ClusterId("cluster:rollup"), "type-set", {
      source: "groups",
      keys: [],
    });
    rollup.addChild(directNode("cluster:child-a", [1]));
    rollup.addChild(directNode("cluster:child-b", [4, 5]));

    expect([...entityIndicesForCluster(rollup, typeSets)]).toEqual([1, 4, 5]);
  });
});

describe("frontierMembers / frontierCount", () => {
  it("yields only non-root members of a direct node", () => {
    const entities = entityStoreOf(4);
    entities.insertRoot(EntityIndex(0));
    entities.insertRoot(EntityIndex(2));
    const typeSets = new TypeSetStore();
    const node = directNode("cluster:direct", [0, 1, 2, 3]);

    expect([...frontierMembers(node, typeSets, entities)]).toEqual([1, 3]);
    expect(frontierCount(node, typeSets, entities)).toBe(2);
  });

  it("yields only non-root members of a groups node", () => {
    const entities = entityStoreOf(3);
    entities.insertRoot(EntityIndex(1));
    const { typeSets, node } = groupsFixture([0, 1, 2]);

    expect([...frontierMembers(node, typeSets, entities)]).toEqual([0, 2]);
    expect(frontierCount(node, typeSets, entities)).toBe(2);
  });

  it("does not recurse into children (unlike entityIndicesForCluster)", () => {
    const entities = entityStoreOf(2);
    const typeSets = new TypeSetStore();
    const rollup = new ClusterNode(ClusterId("cluster:rollup"), "type-set", {
      source: "groups",
      keys: [],
    });
    rollup.addChild(directNode("cluster:child", [0, 1]));

    expect([...frontierMembers(rollup, typeSets, entities)]).toEqual([]);
    expect(frontierCount(rollup, typeSets, entities)).toBe(0);
  });
});

describe("entityIdsForCluster", () => {
  it("maps direct members to their EntityIds", () => {
    const entities = entityStoreOf(3);
    const typeSets = new TypeSetStore();
    const node = directNode("cluster:direct", [2, 0]);

    expect([...entityIdsForCluster(node, typeSets, entities)]).toEqual([
      entityIdFor(2),
      entityIdFor(0),
    ]);
  });

  it("maps group members to their EntityIds", () => {
    const entities = entityStoreOf(3);
    const { typeSets, node } = groupsFixture([1, 2]);

    expect([...entityIdsForCluster(node, typeSets, entities)]).toEqual([
      entityIdFor(1),
      entityIdFor(2),
    ]);
  });
});
