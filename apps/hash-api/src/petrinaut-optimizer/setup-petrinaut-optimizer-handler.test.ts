import { describe, expect, it } from "vitest";

import {
  getPetrinautOptimizerOrigin,
  PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
  PETRINAUT_OPTIMIZER_OPTIMIZE_PATH,
  PETRINAUT_OPTIMIZER_STATUS_PATH,
  setupPetrinautOptimizerHandler,
} from "./setup-petrinaut-optimizer-handler";

import type { Express, Request, Response as ExpressResponse } from "express";

const logger = { warn: () => undefined };

type Handler = (request: Request, response: ExpressResponse) => Promise<void>;

const callGetHandler = async ({
  authenticated = true,
  fetchImpl,
  origin,
  path = PETRINAUT_OPTIMIZER_STATUS_PATH,
}: {
  authenticated?: boolean;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  origin: URL | null;
  path?: string;
}) => {
  let handler: Handler | undefined;
  const app = {
    get: (routePath: string, routeHandler: Handler) => {
      if (routePath === path) {
        handler = routeHandler;
      }
    },
    post: () => undefined,
  } as unknown as Express;

  setupPetrinautOptimizerHandler(app, { fetchImpl, logger, origin });
  if (!handler) {
    throw new Error(`Route ${path} was not registered`);
  }

  let statusCode = 200;
  let body: unknown;
  const response = {
    json: (value: unknown) => {
      body = value;
      return response;
    },
    status: (value: number) => {
      statusCode = value;
      return response;
    },
  } as unknown as ExpressResponse;
  const request = {
    user: authenticated ? ({} as NonNullable<Request["user"]>) : undefined,
  } as Request;

  await handler(request, response);

  return { body, statusCode };
};

describe("getPetrinautOptimizerOrigin", () => {
  it("allows the optimizer to be unconfigured", () => {
    expect(getPetrinautOptimizerOrigin({})).toBeNull();
  });

  it("constructs an HTTP origin from the configured host and port", () => {
    expect(
      getPetrinautOptimizerOrigin({
        HASH_PETRINAUT_OPT_HOST: "petrinaut-opt",
        HASH_PETRINAUT_OPT_PORT: "4004",
      })?.href,
    ).toBe("http://petrinaut-opt:4004/");
  });

  it("rejects partial configuration", () => {
    expect(() =>
      getPetrinautOptimizerOrigin({ HASH_PETRINAUT_OPT_HOST: "localhost" }),
    ).toThrow("must be set together");
  });
});

it("mounts the optimization endpoint", () => {
  let registeredPath: string | undefined;
  const app = {
    get: () => undefined,
    post: (path: string) => {
      registeredPath = path;
    },
  } as unknown as Express;

  setupPetrinautOptimizerHandler(app, { logger, origin: null });

  expect(registeredPath).toBe(PETRINAUT_OPTIMIZER_OPTIMIZE_PATH);
});

describe(PETRINAUT_OPTIMIZER_CAPABILITIES_PATH, () => {
  it("requires authentication", async () => {
    await expect(
      callGetHandler({
        authenticated: false,
        origin: null,
        path: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
      }),
    ).resolves.toEqual({
      body: { error: "Authentication required" },
      statusCode: 401,
    });
  });

  it("reports whether the optimizer is deliberately configured", async () => {
    await expect(
      callGetHandler({
        origin: null,
        path: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
      }),
    ).resolves.toEqual({
      body: { optimization: false },
      statusCode: 200,
    });

    await expect(
      callGetHandler({
        origin: new URL("http://petrinaut-opt:4004"),
        path: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
      }),
    ).resolves.toEqual({
      body: { optimization: true },
      statusCode: 200,
    });
  });
});

describe(PETRINAUT_OPTIMIZER_STATUS_PATH, () => {
  it("requires authentication", async () => {
    const result = await callGetHandler({ authenticated: false, origin: null });

    expect(result).toEqual({
      body: { error: "Authentication required" },
      statusCode: 401,
    });
  });

  it("returns 503 when the optimizer is not configured", async () => {
    const result = await callGetHandler({ origin: null });

    expect(result).toEqual({
      body: { error: "Petrinaut optimizer is not configured" },
      statusCode: 503,
    });
  });

  it("returns a sanitized idle status when there are no runs", async () => {
    const result = await callGetHandler({
      origin: new URL("http://petrinaut-opt:4004"),
      fetchImpl: async () => Response.json([]),
    });

    expect(result).toEqual({
      body: { phase: "idle", detail: null, updated_at: null },
      statusCode: 200,
    });
  });

  it("summarizes optimizer status without exposing another run's details", async () => {
    const requestedUrls: string[] = [];
    const result = await callGetHandler({
      origin: new URL("http://petrinaut-opt:4004"),
      fetchImpl: async (input) => {
        requestedUrls.push(input.toString());
        return Response.json([
          {
            run_id: "run-1",
            phase: "error",
            detail: "private failure details",
            updated_at: "2026-07-16T10:00:00Z",
          },
          {
            run_id: "run-2",
            phase: "running",
            detail: "private model name",
            updated_at: "2026-07-16T10:01:00Z",
          },
        ]);
      },
    });

    expect(result).toEqual({
      body: {
        phase: "running",
        detail: null,
        updated_at: "2026-07-16T10:01:00Z",
      },
      statusCode: 200,
    });
    expect(requestedUrls).toEqual(["http://petrinaut-opt:4004/status"]);
  });

  it("rejects an invalid optimizer status", async () => {
    const result = await callGetHandler({
      origin: new URL("http://petrinaut-opt:4004"),
      fetchImpl: async () =>
        Response.json([{ run_id: "run-1", phase: "unknown" }]),
    });

    expect(result).toEqual({
      body: { error: "Petrinaut optimizer is unavailable" },
      statusCode: 503,
    });
  });
});
