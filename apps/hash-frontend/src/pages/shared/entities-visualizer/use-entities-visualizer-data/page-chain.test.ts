import { describe, expect, it } from "vitest";

import { advancePageChain } from "./page-chain";

import type { ChainPage, PageChain } from "./page-chain";
import type { EntityQueryCursor } from "@local/hash-graph-client";

type TestResponse = { page: string };
type TestIdentity = { filter: string };
type TestPage = ChainPage<TestResponse>;
type TestChain = PageChain<TestIdentity, TestPage>;

const buildPage = (
  response: TestResponse,
  forCursor: EntityQueryCursor | undefined,
): TestPage => ({ sourceResponse: response, forCursor });

const identityA: TestIdentity = { filter: "a" };
const identityB: TestIdentity = { filter: "b" };

const cursorOne: EntityQueryCursor = [{ position: 1 }];
const cursorTwo: EntityQueryCursor = [{ position: 2 }];

const advance = (params: {
  chain: TestChain | null;
  identity: TestIdentity;
  requestedCursor: EntityQueryCursor | undefined;
  response: TestResponse | undefined;
}) => advancePageChain({ buildPage, ...params });

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
      activeCursor: undefined,
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
      activeCursor: undefined,
      pages: [{ sourceResponse: response, forCursor: undefined }],
    });
  });

  it("replaces the chain when the identity has changed", () => {
    const previousChain: TestChain = {
      issuedFor: identityA,
      activeCursor: cursorOne,
      pages: [
        buildPage({ page: "a1" }, undefined),
        buildPage({ page: "a2" }, cursorOne),
      ],
    };

    const response = { page: "b1" };

    const chain = advance({
      chain: previousChain,
      identity: identityB,
      requestedCursor: undefined,
      response,
    });

    expect(chain).toEqual({
      issuedFor: identityB,
      activeCursor: undefined,
      pages: [{ sourceResponse: response, forCursor: undefined }],
    });
  });

  it("returns the same chain when the response is already captured", () => {
    const response = { page: "1" };

    const chain: TestChain = {
      issuedFor: identityA,
      activeCursor: undefined,
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
    const firstPage = buildPage({ page: "1" }, undefined);

    const chain: TestChain = {
      issuedFor: identityA,
      activeCursor: cursorOne,
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
      activeCursor: cursorOne,
      pages: [firstPage, { sourceResponse: response, forCursor: cursorOne }],
    });
  });

  it("rebuilds from a re-delivered first page, dropping later pages", () => {
    const chain: TestChain = {
      issuedFor: identityA,
      activeCursor: cursorOne,
      pages: [
        buildPage({ page: "1" }, undefined),
        buildPage({ page: "2" }, cursorOne),
      ],
    };

    const refreshedFirstPage = { page: "1-refreshed" };

    const advanced = advance({
      chain,
      identity: identityA,
      requestedCursor: undefined,
      response: refreshedFirstPage,
    });

    expect(advanced).toEqual({
      issuedFor: identityA,
      activeCursor: undefined,
      pages: [{ sourceResponse: refreshedFirstPage, forCursor: undefined }],
    });
  });

  it("replaces a re-delivered later page and drops the pages after it", () => {
    const firstPage = buildPage({ page: "1" }, undefined);

    const chain: TestChain = {
      issuedFor: identityA,
      activeCursor: cursorTwo,
      pages: [
        firstPage,
        buildPage({ page: "2" }, cursorOne),
        buildPage({ page: "3" }, cursorTwo),
      ],
    };

    const refreshedSecondPage = { page: "2-refreshed" };

    const advanced = advance({
      chain,
      identity: identityA,
      requestedCursor: cursorOne,
      response: refreshedSecondPage,
    });

    expect(advanced).toEqual({
      issuedFor: identityA,
      activeCursor: cursorTwo,
      pages: [
        firstPage,
        { sourceResponse: refreshedSecondPage, forCursor: cursorOne },
      ],
    });
  });
});
