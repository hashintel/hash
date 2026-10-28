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

const runPaginatedQuery = (paginatedFields: string) =>
  graphql({
    schema,
    source: `query { getFlowRuns { ${paginatedFields} } }`,
    contextValue: { authentication: {}, dataSources: {}, temporal: {} },
  });

const runQuery = (flowRunFields: string) =>
  runPaginatedQuery(`flowRuns { ${flowRunFields} }`);

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

  it("refuses `events` on `flowRuns` selected again under an alias", async () => {
    const result = await runPaginatedQuery(
      "flowRuns { name } histories: flowRuns { events { hasNextPage } }",
    );

    expect(result.errors).toHaveLength(1);
    expect(mocks.getFlowRuns).not.toHaveBeenCalled();
  });

  it("reads details asked for only on an aliased `flowRuns`", async () => {
    const result = await runPaginatedQuery(
      "flowRuns { name } detailed: flowRuns { flowInputs }",
    );

    expect(result.errors).toBeUndefined();
    expect(mocks.getFlowRuns).toHaveBeenCalledWith(
      expect.objectContaining({ includeDetails: true }),
    );
  });

  it("lists runs when `flowRuns` is only selected under an alias", async () => {
    const result = await runPaginatedQuery("runs: flowRuns { name }");

    expect(result.errors).toBeUndefined();
    expect(mocks.getFlowRuns).toHaveBeenCalledWith(
      expect.objectContaining({ includeDetails: false }),
    );
  });

  it("lists runs when `events` isn't asked for", async () => {
    const result = await runQuery("name flowInputs");

    expect(result.errors).toBeUndefined();
    expect(mocks.getFlowRuns).toHaveBeenCalledWith(
      expect.objectContaining({ includeDetails: true }),
    );
  });
});
