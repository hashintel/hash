/* The CommonJS build, which `graphql-parse-resolve-info` uses: its checks reject a schema from the ESM build. */
import { buildASTSchema, concatAST, graphql } from "graphql/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { schema as typeDefs } from "@local/hash-isomorphic-utils/graphql/type-defs/schema";

import { getFlowRunsResolver } from "./get-flow-runs";

const mocks = vi.hoisted(() => ({ getFlowRuns: vi.fn() }));

vi.mock("@local/hash-backend-utils/flows", () => ({
  getFlowRuns: mocks.getFlowRuns,
}));

const schema = buildASTSchema(concatAST(typeDefs));
schema.getQueryType()!.getFields().getFlowRuns!.resolve =
  getFlowRunsResolver as never;

const runQuery = (flowRunFields: string) =>
  graphql({
    schema,
    source: `query { getFlowRuns { flowRuns { ${flowRunFields} } } }`,
    contextValue: { authentication: {}, dataSources: {}, temporal: {} },
  });

describe("getFlowRunsResolver", () => {
  beforeEach(() => {
    mocks.getFlowRuns.mockReset();
    mocks.getFlowRuns.mockResolvedValue({
      flowRuns: [],
      totalCount: 0,
      nextCursor: null,
    });
  });

  it("refuses `events`, before reading any run", async () => {
    const result = await runQuery("name events { hasNextPage }");

    expect(result.errors?.map(({ message }) => message)).toEqual([
      "`events` can only be requested for a single run, with `getFlowRunById`",
    ]);
    expect(mocks.getFlowRuns).not.toHaveBeenCalled();
  });

  it("refuses `events` under an alias", async () => {
    const result = await runQuery("history: events { hasNextPage }");

    expect(result.errors).toHaveLength(1);
    expect(mocks.getFlowRuns).not.toHaveBeenCalled();
  });

  it("lists runs when `events` isn't asked for", async () => {
    const result = await runQuery("name steps { stepId }");

    expect(result.errors).toBeUndefined();
    expect(mocks.getFlowRuns).toHaveBeenCalledWith(
      expect.objectContaining({ includeDetails: true }),
    );
  });
});
