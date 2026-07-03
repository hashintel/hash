import { describe, expect, it } from "vitest";

import {
  ClusterId,
  EntityIndex,
  nodeIdForEntityIndex,
  TypeSetId,
} from "../../ids";
import { Column } from "../collections/column";
import { ClusterNode } from "../hierarchy/cluster-tree";
import { LinkStore } from "./store/link";
import { TypeSetStore } from "./store/type-set";
import { buildClusterEdges, buildEntityEdges } from "./entity-edges";

import type { ForceNode } from "../layout/force-simulation";

const TYPE = TypeSetId(0);

/** The link entity itself also gets an index; keep those clear of the node range. */
let nextLinkEntity = 1000;
function link(links: LinkStore, left: number, right: number): void {
  links.insert(
    EntityIndex(left),
    EntityIndex(right),
    TYPE,
    EntityIndex(nextLinkEntity++),
  );
}

function nodesFor(entityIdxs: readonly number[]): ForceNode[] {
  return entityIdxs.map((idx) => ({
    id: nodeIdForEntityIndex(EntityIndex(idx)),
    x: 0,
    y: 0,
    radius: 1,
  }));
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

describe("buildEntityEdges", () => {
  it("emits one edge per linked member pair, referencing node ids", () => {
    const links = new LinkStore();
    link(links, 0, 1);
    link(links, 1, 2);

    const memberIdxs = [0, 1, 2].map(EntityIndex);
    const edges = buildEntityEdges(memberIdxs, nodesFor([0, 1, 2]), links);

    expect(edges).toEqual([
      {
        source: nodeIdForEntityIndex(EntityIndex(0)),
        target: nodeIdForEntityIndex(EntityIndex(1)),
        weight: 1,
      },
      {
        source: nodeIdForEntityIndex(EntityIndex(1)),
        target: nodeIdForEntityIndex(EntityIndex(2)),
        weight: 1,
      },
    ]);
  });

  it("deduplicates parallel links into a single edge", () => {
    const links = new LinkStore();
    link(links, 0, 1);
    link(links, 1, 0);
    link(links, 0, 1);

    const memberIdxs = [0, 1].map(EntityIndex);
    const edges = buildEntityEdges(memberIdxs, nodesFor([0, 1]), links);

    expect(edges).toHaveLength(1);
  });

  it("ignores links whose other endpoint is outside the member set", () => {
    const links = new LinkStore();
    link(links, 0, 7);

    const memberIdxs = [0, 1].map(EntityIndex);
    const edges = buildEntityEdges(memberIdxs, nodesFor([0, 1]), links);

    expect(edges).toEqual([]);
  });
});

describe("buildClusterEdges", () => {
  it("weights a sibling pair by its inter-cluster link count, counted once", () => {
    const links = new LinkStore();
    link(links, 0, 2);
    link(links, 1, 3);
    link(links, 1, 2);
    // Intra-cluster link contributes nothing.
    link(links, 0, 1);

    const typeSets = new TypeSetStore();
    const children = [
      directNode("cluster:a", [0, 1]),
      directNode("cluster:b", [2, 3]),
    ];

    const edges = buildClusterEdges(children, links, typeSets);

    expect(edges).toEqual([
      { source: "cluster:a", target: "cluster:b", weight: 3 },
    ]);
  });

  it("ignores links to entities owned by no sibling", () => {
    const links = new LinkStore();
    link(links, 0, 99);

    const typeSets = new TypeSetStore();
    const children = [
      directNode("cluster:a", [0]),
      directNode("cluster:b", [1]),
    ];

    expect(buildClusterEdges(children, links, typeSets)).toEqual([]);
  });
});
