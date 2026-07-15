import { describe, expect, it } from "vitest";

import {
  getPetrinautOptimizerOrigin,
  PETRINAUT_OPTIMIZER_STATUS_PATH,
  setupPetrinautOptimizerHandler,
} from "./setup-petrinaut-optimizer-handler";

import type { Express, Request, Response as ExpressResponse } from "express";

const logger = { warn: () => undefined };

type Handler = (request: Request, response: ExpressResponse) => Promise<void>;

const callHandler = async ({
  authenticated = true,
  fetchImpl,
  origin,
}: {
  authenticated?: boolean;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  origin: URL | null;
}) => {
  let handler: Handler | undefined;
  let registeredPath: string | undefined;
  const app = {
    get: (path: string, routeHandler: Handler) => {
      registeredPath = path;
      handler = routeHandler;
    },
  } as unknown as Express;

  setupPetrinautOptimizerHandler(app, { fetchImpl, logger, origin });

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

  await handler?.(request, response);

  return { body, registeredPath, statusCode };
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

describe(PETRINAUT_OPTIMIZER_STATUS_PATH, () => {
  it("requires authentication", async () => {
    const result = await callHandler({ authenticated: false, origin: null });

    expect(result).toEqual({
      body: { error: "Authentication required" },
      registeredPath: PETRINAUT_OPTIMIZER_STATUS_PATH,
      statusCode: 401,
    });
  });

  it("returns 503 when the optimizer is not configured", async () => {
    const result = await callHandler({ origin: null });

    expect(result).toEqual({
      body: { error: "Petrinaut optimizer is not configured" },
      registeredPath: PETRINAUT_OPTIMIZER_STATUS_PATH,
      statusCode: 503,
    });
  });

  it("forwards the optimizer status", async () => {
    const requestedUrls: string[] = [];
    const result = await callHandler({
      origin: new URL("http://petrinaut-opt:4004"),
      fetchImpl: async (input) => {
        requestedUrls.push(input.toString());
        return Response.json({ phase: "idle", detail: null });
      },
    });

    expect(result).toEqual({
      body: { phase: "idle", detail: null },
      registeredPath: PETRINAUT_OPTIMIZER_STATUS_PATH,
      statusCode: 200,
    });
    expect(requestedUrls).toEqual(["http://petrinaut-opt:4004/status"]);
  });

  it("rejects an invalid optimizer status", async () => {
    const result = await callHandler({
      origin: new URL("http://petrinaut-opt:4004"),
      fetchImpl: async () => Response.json({ phase: "unknown" }),
    });

    expect(result).toEqual({
      body: { error: "Petrinaut optimizer is unavailable" },
      registeredPath: PETRINAUT_OPTIMIZER_STATUS_PATH,
      statusCode: 503,
    });
  });
});
