import path from "node:path";

import {
  fullDecisionTimeAxis,
  zeroedGraphResolveDepths,
} from "@apps/hash-api/src/graph";
import { getEntities } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import {
  BaseUrl,
  QueryTemporalAxesUnresolved,
  Timestamp,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { resetToSnapshot } from "../test-server";
import { createTestImpureGraphContext } from "../util";

jest.setTimeout(60000);

export const temporalAxesForTimestamp = (
  decisionTime: Timestamp | null,
  transactionTime: Timestamp | null,
): QueryTemporalAxesUnresolved => {
  return {
    pinned: {
      axis: "transactionTime",
      timestamp: transactionTime,
    },
    variable: {
      axis: "decisionTime",
      interval: {
        start: decisionTime
          ? {
              kind: "inclusive",
              limit: decisionTime,
            }
          : null,
        end: decisionTime
          ? {
              kind: "inclusive",
              limit: decisionTime,
            }
          : null,
      },
    },
  };
};

const nameProperty: BaseUrl =
  "http://localhost:3000/@alice/types/property-type/name/";

describe("Friendship Snapshot", () => {
  const graphContext = createTestImpureGraphContext();

  it("can upload snapshot", async () => {
    await expect(
      resetToSnapshot(path.join(__dirname, "pass", "friendship.jsonl")),
    ).resolves.not.toThrowError();
  });

  it("read all entities", async () => {
    const entities = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: fullDecisionTimeAxis,
      },
    }).then(getRoots);

    expect(entities.length).toBe(5);
  });

  it("read entities at 2000-01-01 as of now", async () => {
    const entities = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2000-01-01T00:00Z" as Timestamp,
          null,
        ),
      },
    }).then(getRoots);

    expect(entities.length).toBe(0);
  });

  it("read entities at 2001-01-01 as of now", async () => {
    const entities = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2001-01-01T00:00Z" as Timestamp,
          null,
        ),
      },
    }).then(getRoots);

    expect(entities.length).toBe(1);
  });

  it("read entities at 2001-01-01 as of 2001-01-01", async () => {
    const entities = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2001-01-01T00:00Z" as Timestamp,
          "2001-01-01T00:00Z" as Timestamp,
        ),
      },
    }).then(getRoots);

    expect(entities.length).toBe(0);
  });

  it("read entities at 2001-01-01 as of 2001-01-20", async () => {
    const entities = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2001-01-01T00:00Z" as Timestamp,
          "2001-01-20T00:00Z" as Timestamp,
        ),
      },
    }).then(getRoots);

    expect(entities.length).toBe(1);
  });

  it("read entities at 2002-01-01 as of 2001-01-01", async () => {
    const entities = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2002-01-01T00:00Z" as Timestamp,
          "2001-01-01T00:00Z" as Timestamp,
        ),
      },
    }).then(getRoots);

    expect(entities.length).toBe(0);
  });

  it("read entities at 2002-02-01 as of now", async () => {
    const entities = await getEntities(graphContext, {
      query: {
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: temporalAxesForTimestamp(
          "2001-02-01T00:00Z" as Timestamp,
          null,
        ),
      },
    }).then(getRoots);

    expect(entities.length).toBe(1);
    expect(entities[0]!.metadata.recordId.editionId).toBe(
      "00000001-0001-0000-0000-000000000002",
    );
    expect(entities[0]!.properties[nameProperty]).toBe("Alice Allison");
  });
});
