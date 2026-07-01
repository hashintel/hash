/**
 * Store-ingestion hot path (runs once per ingested entity; the whole page-load
 * stream flows through it). Isolates the per-entity type-set keying, the entity
 * interner, and the link adjacency + `linksForEntity` allocation, so a regression
 * in any of them shows up here without the layout/commit noise on top.
 *
 * Run: `cd apps/hash-frontend && ../../node_modules/.bin/vitest bench --run \
 *   src/pages/shared/graph-visualizer-2/worker/stores/ingestion.bench.ts`
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { EntityIdx, TypeIdx, TypeSetIdx } from "../../ids";
import { benchEntityId, buildCommunityInputs } from "../bench-fixtures";
import { ReadonlySortedSet } from "../collections/readonly-sorted-set";
import { EntityStore } from "./entity-store";
import { TypeSetStore } from "./type-set-store";

import type { GraphShape } from "../bench-fixtures";

const compareTypeIdx = (lhs: TypeIdx, rhs: TypeIdx): number => lhs - rhs;

interface Case {
  readonly label: string;
  readonly shape: GraphShape;
}

const CASES: readonly Case[] = [
  {
    label: "small (1k nodes / 2k links)",
    shape: {
      nodeCount: 1_000,
      linkCount: 2_000,
      typeCount: 12,
      hubCount: 20,
      rootFraction: 1,
      seed: 1,
    },
  },
  {
    label: "medium (5k nodes / 10k links)",
    shape: {
      nodeCount: 5_000,
      linkCount: 10_000,
      typeCount: 24,
      hubCount: 40,
      rootFraction: 1,
      seed: 2,
    },
  },
  {
    label: "large (20k nodes / 40k links)",
    shape: {
      nodeCount: 20_000,
      linkCount: 40_000,
      typeCount: 48,
      hubCount: 80,
      rootFraction: 1,
      seed: 3,
    },
  },
];

/** A representative per-node direct type index list (mostly one type, some two). */
function typeIdxsFor(nodeIndex: number, typeCount: number): TypeIdx[] {
  const primary = TypeIdx(nodeIndex % typeCount);
  if (nodeIndex % 5 === 0) {
    return [primary, TypeIdx((nodeIndex * 7 + 1) % typeCount)];
  }
  return [primary];
}

for (const { label, shape } of CASES) {
  describe(`type-set keying: ${label}`, () => {
    // `ingestBatch` builds a ReadonlySortedSet + calls getOrCreate ONCE in
    // #peekGroup and AGAIN in insertNodeEntity for every node entity, so the
    // per-node keying cost below is paid twice per streamed node.
    bench("ReadonlySortedSet + getOrCreate once per node", () => {
      const store = new TypeSetStore();
      for (let nodeIndex = 0; nodeIndex < shape.nodeCount; nodeIndex++) {
        const set = new ReadonlySortedSet(
          typeIdxsFor(nodeIndex, shape.typeCount),
          compareTypeIdx,
        );
        store.getOrCreate(set, shape.typeCount);
      }
    });

    bench("ReadonlySortedSet + getOrCreate twice per node (peek + insert)", () => {
      const store = new TypeSetStore();
      for (let nodeIndex = 0; nodeIndex < shape.nodeCount; nodeIndex++) {
        const peekSet = new ReadonlySortedSet(
          typeIdxsFor(nodeIndex, shape.typeCount),
          compareTypeIdx,
        );
        store.getOrCreate(peekSet, shape.typeCount);
        const insertSet = new ReadonlySortedSet(
          typeIdxsFor(nodeIndex, shape.typeCount),
          compareTypeIdx,
        );
        store.getOrCreate(insertSet, shape.typeCount);
      }
    });
  });

  describe(`entity interning: ${label}`, () => {
    bench("EntityStore.tryInsert per node", () => {
      const store = new EntityStore();
      for (let nodeIndex = 0; nodeIndex < shape.nodeCount; nodeIndex++) {
        const [, idx] = store.tryInsert(benchEntityId(nodeIndex));
        store.setTypeGroup(idx, TypeSetIdx(nodeIndex % shape.typeCount));
      }
    });
  });

  describe(`link adjacency: ${label}`, () => {
    // linksForEntity allocates a fresh LinkEndpoint[] (one object literal per
    // incident link) on EVERY call, and several hot paths call it just to read
    // `.length` (degree). This bench sweeps every entity's adjacency once, the
    // shape of #seedFlatNodes / #buildEntityFanOut / community feature scans.
    bench("build LinkStore + linksForEntity over all nodes", () => {
      const { links } = buildCommunityInputs(shape);
      let degreeSum = 0;
      for (let nodeIndex = 0; nodeIndex < shape.nodeCount; nodeIndex++) {
        degreeSum += links.linksForEntity(EntityIdx(nodeIndex)).length;
      }
      if (degreeSum < 0) {
        throw new Error("unreachable");
      }
    });
  });
}
