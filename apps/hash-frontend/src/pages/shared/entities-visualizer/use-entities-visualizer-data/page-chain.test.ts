import { describe, expect, it } from "vitest";

import { advancePageChain, growPageWindow } from "./page-chain";

import type { ChainPage, PageChain } from "./page-chain";
import type { EntityQueryCursor } from "@local/hash-graph-client";

type TestResponse = { page: string; nextCursor?: EntityQueryCursor };
type TestIdentity = { filter: string };
type TestPage = ChainPage<TestResponse>;
type TestChain = PageChain<TestIdentity, TestPage>;

const buildPage = (
  response: TestResponse,
  forCursor: EntityQueryCursor | undefined,
): TestPage => ({
  sourceResponse: response,
  forCursor,
  nextCursor: response.nextCursor ?? null,
});

const identityA: TestIdentity = { filter: "a" };
const identityB: TestIdentity = { filter: "b" };

const windowKeyA = "set-a";
const windowKeyB = "set-b";

const cursorOne: EntityQueryCursor = [{ position: 1 }];
const cursorTwo: EntityQueryCursor = [{ position: 2 }];

const advance = (params: {
  chain: TestChain | null;
  identity: TestIdentity;
  requestedCursor: EntityQueryCursor | undefined;
  response: TestResponse | undefined;
  windowKey?: string;
}) => advancePageChain({ buildPage, windowKey: windowKeyA, ...params });

describe("advancePageChain", () => {
  it("returns the chain unchanged (same reference) when there is no response", () => {
    expect(
      advance({
        chain: null,
        identity: identityA,
        requestedCursor: undefined,
        response: undefined,
      }),
    ).toBeNull();

    const chain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: undefined,
      targetPageCount: 1,
      pages: [buildPage({ page: "1" }, undefined)],
    };

    expect(
      advance({
        chain,
        identity: identityA,
        requestedCursor: undefined,
        response: undefined,
      }),
    ).toBe(chain);
  });

  it("starts a chain from the first response", () => {
    const response = { page: "1" };

    const chain = advance({
      chain: null,
      identity: identityA,
      requestedCursor: undefined,
      response,
    });

    expect(chain).toEqual({
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: undefined,
      targetPageCount: 1,
      pages: [
        { sourceResponse: response, forCursor: undefined, nextCursor: null },
      ],
    });
  });

  it("replaces the chain and resets the window when the entity set has changed", () => {
    const previousChain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: cursorOne,
      targetPageCount: 2,
      pages: [
        buildPage({ page: "a1", nextCursor: cursorOne }, undefined),
        buildPage({ page: "a2" }, cursorOne),
      ],
    };

    const response = { page: "b1" };

    const chain = advance({
      chain: previousChain,
      identity: identityB,
      requestedCursor: undefined,
      response,
      windowKey: windowKeyB,
    });

    expect(chain).toEqual({
      issuedFor: identityB,
      windowKey: windowKeyB,
      activeCursor: undefined,
      targetPageCount: 1,
      pages: [
        { sourceResponse: response, forCursor: undefined, nextCursor: null },
      ],
    });
  });

  it("keeps the window and arms the refill when the same set is refetched with a new shape", () => {
    // Two table pages accumulated, then the inputs change shape (e.g. graph
    // traversal paths) while the entity set stays the same.
    const tableChain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: cursorOne,
      targetPageCount: 2,
      pages: [
        buildPage({ page: "t1", nextCursor: cursorOne }, undefined),
        buildPage({ page: "t2" }, cursorOne),
      ],
    };

    const graphIdentity: TestIdentity = { filter: "a" };
    const graphFirstPage = { page: "g1", nextCursor: cursorTwo };

    const rebuilt = advance({
      chain: tableChain,
      identity: graphIdentity,
      requestedCursor: undefined,
      response: graphFirstPage,
    });

    // The window (2 pages) is inherited and the cursor for page two is
    // already armed, so the caller's next request refills the window.
    expect(rebuilt).toEqual({
      issuedFor: graphIdentity,
      windowKey: windowKeyA,
      activeCursor: cursorTwo,
      targetPageCount: 2,
      pages: [
        {
          sourceResponse: graphFirstPage,
          forCursor: undefined,
          nextCursor: cursorTwo,
        },
      ],
    });

    const graphSecondPage = { page: "g2" };

    const refilled = advance({
      chain: rebuilt,
      identity: graphIdentity,
      requestedCursor: cursorTwo,
      response: graphSecondPage,
    });

    expect(refilled?.pages).toHaveLength(2);
    // Window reached: no further cursor armed.
    expect(refilled?.activeCursor).toBe(cursorTwo);
    expect(refilled?.pages.at(-1)?.nextCursor).toBeNull();
  });

  it("stops refilling when the result set runs out of pages", () => {
    const chain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: undefined,
      targetPageCount: 3,
      pages: [],
    };

    // The refreshed set only has one page (no next cursor).
    const onlyPage = { page: "1" };

    const advanced = advance({
      chain,
      identity: identityA,
      requestedCursor: undefined,
      response: onlyPage,
    });

    expect(advanced?.pages).toHaveLength(1);
    expect(advanced?.activeCursor).toBeUndefined();
    expect(advanced?.targetPageCount).toBe(3);
  });

  it("returns the same chain when the response is already captured", () => {
    const response = { page: "1" };

    const chain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: undefined,
      targetPageCount: 1,
      pages: [buildPage(response, undefined)],
    };

    expect(
      advance({
        chain,
        identity: identityA,
        requestedCursor: undefined,
        response,
      }),
    ).toBe(chain);
  });

  it("appends a page fetched with a new cursor", () => {
    const firstPage = buildPage(
      { page: "1", nextCursor: cursorOne },
      undefined,
    );

    const chain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: cursorOne,
      targetPageCount: 2,
      pages: [firstPage],
    };

    const response = { page: "2" };

    const advanced = advance({
      chain,
      identity: identityA,
      requestedCursor: cursorOne,
      response,
    });

    expect(advanced).toEqual({
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: cursorOne,
      targetPageCount: 2,
      pages: [
        firstPage,
        { sourceResponse: response, forCursor: cursorOne, nextCursor: null },
      ],
    });
  });

  it("rebuilds from a re-delivered first page and re-chases the window", () => {
    const chain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: cursorOne,
      targetPageCount: 2,
      pages: [
        buildPage({ page: "1", nextCursor: cursorOne }, undefined),
        buildPage({ page: "2" }, cursorOne),
      ],
    };

    const refreshedFirstPage = { page: "1-refreshed", nextCursor: cursorTwo };

    const advanced = advance({
      chain,
      identity: identityA,
      requestedCursor: undefined,
      response: refreshedFirstPage,
    });

    // Later pages are dropped (they continued the old result set), and the
    // kept window immediately arms the refreshed second page's cursor.
    expect(advanced).toEqual({
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: cursorTwo,
      targetPageCount: 2,
      pages: [
        {
          sourceResponse: refreshedFirstPage,
          forCursor: undefined,
          nextCursor: cursorTwo,
        },
      ],
    });
  });

  it("replaces a re-delivered later page and drops the pages after it", () => {
    const firstPage = buildPage(
      { page: "1", nextCursor: cursorOne },
      undefined,
    );

    const chain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: cursorTwo,
      targetPageCount: 3,
      pages: [
        firstPage,
        buildPage({ page: "2", nextCursor: cursorTwo }, cursorOne),
        buildPage({ page: "3" }, cursorTwo),
      ],
    };

    const refreshedSecondPage = { page: "2-refreshed", nextCursor: cursorTwo };

    const advanced = advance({
      chain,
      identity: identityA,
      requestedCursor: cursorOne,
      response: refreshedSecondPage,
    });

    expect(advanced).toEqual({
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: cursorTwo,
      targetPageCount: 3,
      pages: [
        firstPage,
        {
          sourceResponse: refreshedSecondPage,
          forCursor: cursorOne,
          nextCursor: cursorTwo,
        },
      ],
    });
  });
});

describe("growPageWindow", () => {
  it("widens the window one page beyond what is held and arms its cursor", () => {
    const chain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: undefined,
      targetPageCount: 1,
      pages: [buildPage({ page: "1", nextCursor: cursorOne }, undefined)],
    };

    const grown = growPageWindow(chain);

    expect(grown.targetPageCount).toBe(2);
    expect(grown.activeCursor).toBe(cursorOne);
  });

  it("is a no-op while a refill toward the window is already in flight", () => {
    const chain: TestChain = {
      issuedFor: identityA,
      windowKey: windowKeyA,
      activeCursor: cursorOne,
      targetPageCount: 2,
      pages: [buildPage({ page: "1", nextCursor: cursorOne }, undefined)],
    };

    const grown = growPageWindow(chain);

    expect(grown.targetPageCount).toBe(2);
    expect(grown.activeCursor).toBe(cursorOne);
  });
});
