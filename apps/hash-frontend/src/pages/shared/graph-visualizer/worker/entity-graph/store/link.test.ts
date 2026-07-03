/**
 * Pending-endpoint resolution guards for {@link LinkStore}: a link whose
 * endpoint entity arrives after the link itself must end up with exactly the
 * endpoints it declared -- resolving must never rewrite the side that was
 * already known (the A->B becomes B->B corruption), and adjacency must count
 * each incident link once.
 */

import { describe, expect, it } from "vitest";

import { entityIdFromComponents } from "@blockprotocol/type-system";

import { EntityIndex, TypeSetId } from "../../../ids";
import { LinkStore } from "./link";

import type { EntityUuid, WebId } from "@blockprotocol/type-system";

const webId = "11111111-1111-4111-8111-111111111111" as WebId;

const entityIdFor = (index: number) =>
  entityIdFromComponents(
    webId,
    `22222222-2222-4222-8222-${index.toString(16).padStart(12, "0")}` as EntityUuid,
  );

const TYPE = TypeSetId(0);

describe("LinkStore pending-endpoint resolution", () => {
  it("fills only the missing side when one endpoint arrives late", () => {
    const store = new LinkStore();
    const left = EntityIndex(10);
    const lateRightId = entityIdFor(2);

    const linkId = store.insert(left, -1, TYPE, EntityIndex(100));
    store.addPending(lateRightId, linkId, "right");

    const pending = store.takePending(lateRightId)!;
    expect(pending).toEqual([{ linkId, side: "right" }]);

    const right = EntityIndex(20);
    store.resolveEndpoint(linkId, pending[0]!.side, right);

    expect(store.getLeft(linkId)).toBe(left);
    expect(store.getRight(linkId)).toBe(right);
    expect(store.degreeOf(left)).toBe(1);
    expect(store.degreeOf(right)).toBe(1);
  });

  it("resolves each side independently when both endpoints arrive late", () => {
    const store = new LinkStore();
    const leftId = entityIdFor(1);
    const rightId = entityIdFor(2);

    const linkId = store.insert(-1, -1, TYPE, EntityIndex(100));
    store.addPending(leftId, linkId, "left");
    store.addPending(rightId, linkId, "right");

    const left = EntityIndex(10);
    for (const { side } of store.takePending(leftId)!) {
      store.resolveEndpoint(linkId, side, left);
    }
    // Half-resolved: the right side must still be pending, not aliased to left.
    expect(store.getLeft(linkId)).toBe(left);
    expect(store.getRight(linkId)).toBe(-1);

    const right = EntityIndex(20);
    for (const { side } of store.takePending(rightId)!) {
      store.resolveEndpoint(linkId, side, right);
    }
    expect(store.getLeft(linkId)).toBe(left);
    expect(store.getRight(linkId)).toBe(right);
    expect(store.degreeOf(left)).toBe(1);
    expect(store.degreeOf(right)).toBe(1);

    const fromLeft = [...store.linksFor(left)];
    expect(fromLeft).toEqual([
      { linkId, otherId: right, typeSetId: TYPE, direction: "out" },
    ]);
    const fromRight = [...store.linksFor(right)];
    expect(fromRight).toEqual([
      { linkId, otherId: left, typeSetId: TYPE, direction: "in" },
    ]);
  });

  it("logs resolutions for incremental consumers and clears on drain", () => {
    const store = new LinkStore();
    const rightId = entityIdFor(2);

    const linkId = store.insert(EntityIndex(1), -1, TYPE, EntityIndex(100));
    store.addPending(rightId, linkId, "right");
    store.resolveEndpoint(linkId, "right", EntityIndex(20));

    expect(store.drainResolvedEndpoints()).toEqual([{ linkId, side: "right" }]);
    expect(store.drainResolvedEndpoints()).toEqual([]);
  });
});
