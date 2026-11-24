import { gql } from "@apollo/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createApolloClient } from "./create-apollo-client.js";

import type { RetryContext } from "./create-apollo-client.js";

vi.mock("@sentry/browser", () => ({
  withScope: (callback: (scope: { setExtra: () => void }) => void) =>
    callback({ setExtra: () => {} }),
  captureException: vi.fn(),
}));

const query = gql`
  query probe {
    probe
  }
`;

let start = 0;
/** When each request was sent, in ms since the test began. */
const sent: number[] = [];
let respond: () => Promise<Response>;

const networkFailure = () => Promise.reject(new TypeError("Failed to fetch"));
const graphQLFailure = () =>
  Promise.resolve(
    Response.json({
      errors: [
        {
          message: "The graph is down",
          path: ["probe"],
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        },
      ],
    }),
  );

beforeEach(() => {
  vi.useFakeTimers();
  sent.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      sent.push(Date.now() - start);
      return respond();
    }),
  );
  start = Date.now();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const run = async (context?: RetryContext) => {
  const client = createApolloClient({ isBrowser: true });
  const outcome = client
    .query({ query, fetchPolicy: "network-only", context })
    .then(
      () => "answered",
      (error: unknown) => error,
    );
  await vi.runAllTimersAsync();
  return outcome;
};

test("an operation that opts in is retried after each of its delays, then fails", async () => {
  respond = networkFailure;
  const outcome = await run({ retryDelaysMs: [1_000, 2_000, 4_000] });
  expect(outcome).toBeInstanceOf(Error);
  expect(sent).toEqual([0, 1_000, 3_000, 7_000]);
});

test("an operation that opts in is retried for an answer with errors and preserves graphQLErrors", async () => {
  respond = graphQLFailure;
  const outcome = await run({ retryDelaysMs: [500] });
  expect(outcome).toBeInstanceOf(Error);
  expect(outcome).toMatchObject({
    networkError: null,
    graphQLErrors: [
      expect.objectContaining({
        message: "The graph is down",
        extensions: { code: "INTERNAL_SERVER_ERROR" },
      }),
    ],
  });
  expect(sent).toEqual([0, 500]);
});

test("an operation that opts in preserves partial data with errorPolicy: 'all' after retries exhaust", async () => {
  respond = () =>
    Promise.resolve(
      Response.json({
        data: { probe: "partial" },
        errors: [
          {
            message: "Partial failure",
            path: ["probe"],
            extensions: { code: "PARTIAL" },
          },
        ],
      }),
    );
  const client = createApolloClient({ isBrowser: true });
  const outcomePromise = client.query({
    query,
    fetchPolicy: "network-only",
    errorPolicy: "all",
    context: { retryDelaysMs: [250] } satisfies RetryContext,
  });
  await vi.runAllTimersAsync();
  const outcome = await outcomePromise;
  expect(outcome.data).toEqual({ probe: "partial" });
  expect(outcome.errors).toEqual([
    expect.objectContaining({
      message: "Partial failure",
      extensions: { code: "PARTIAL" },
    }),
  ]);
  expect(sent).toEqual([0, 250]);
});

test("an operation that opts in stops retrying once it is answered", async () => {
  let failures = 1;
  respond = () =>
    failures-- > 0
      ? networkFailure()
      : Promise.resolve(Response.json({ data: { probe: "ok" } }));
  expect(await run({ retryDelaysMs: [1_000, 2_000] })).toBe("answered");
  expect(sent).toEqual([0, 1_000]);
});

test("an operation that doesn't opt in is sent once, failing or not", async () => {
  respond = networkFailure;
  expect(await run()).toBeInstanceOf(Error);
  expect(sent).toEqual([0]);

  sent.length = 0;
  respond = graphQLFailure;
  expect(await run()).toBeInstanceOf(Error);
  expect(sent).toEqual([0]);
});
