import { describe, expect, it } from "vitest";

import { loadSiteProductionTimeline } from "./site-production-timeline-loader";

import type { SiteProductionTimeline } from "@local/hash-isomorphic-utils/site-production-timeline";

const deferred = <Value>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const timeline = (siteId: string) =>
  ({ site_id: siteId }) as SiteProductionTimeline;

describe("site production timeline loader", () => {
  it("clears site A immediately and ignores its response after navigating to B", async () => {
    const siteA = deferred<SiteProductionTimeline>();
    const siteB = deferred<SiteProductionTimeline>();
    const requests = new Map([
      ["site-a", siteA],
      ["site-b", siteB],
    ]);
    let currentSiteId = "site-a";
    let displayedTimeline: SiteProductionTimeline | null = timeline("site-a");
    const fetchTimeline = (siteId: string) => requests.get(siteId)!.promise;
    const startRequest = (siteId: string) =>
      loadSiteProductionTimeline({
        fetchTimeline,
        isCurrent: () => currentSiteId === siteId,
        onError: () => {},
        onSettled: () => {},
        onStart: () => {
          displayedTimeline = null;
        },
        onSuccess: (nextTimeline) => {
          displayedTimeline = nextTimeline;
        },
        siteId,
      });

    const pendingA = startRequest("site-a");
    expect(displayedTimeline).toBeNull();

    currentSiteId = "site-b";
    const pendingB = startRequest("site-b");
    siteB.resolve(timeline("site-b"));
    await pendingB;
    expect(displayedTimeline.site_id).toBe("site-b");

    siteA.resolve(timeline("site-a"));
    await pendingA;
    expect(displayedTimeline.site_id).toBe("site-b");
  });
});
