import { describe, expect, it } from "vitest";

import {
  getPetrinautOptimizerOrigin,
  PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
  PETRINAUT_OPTIMIZER_OPTIMIZE_PATH,
  setupPetrinautOptimizerHandler,
} from "./setup-petrinaut-optimizer-handler";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { Express, Request, Response as ExpressResponse } from "express";

const logger = { warn: () => undefined } as unknown as Pick<Logger, "warn">;

type Handler = (
  request: Request,
  response: ExpressResponse,
) => Promise<void> | void;

const callGetHandler = async ({
  authenticated = true,
  origin,
}: {
  authenticated?: boolean;
  origin: URL | null;
}) => {
  let handler: Handler | undefined;
  const app = {
    get: (routePath: string, routeHandler: Handler) => {
      if (routePath === PETRINAUT_OPTIMIZER_CAPABILITIES_PATH) {
        handler = routeHandler;
      }
    },
    post: () => undefined,
  } as unknown as Express;

  setupPetrinautOptimizerHandler(app, { logger, origin });
  if (!handler) {
    throw new Error("The capabilities route was not registered");
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
  let registeredRoute: { handlerCount: number; path: string } | undefined;
  const app = {
    get: () => undefined,
    post: (path: string, ...handlers: unknown[]) => {
      registeredRoute = { handlerCount: handlers.length, path };
    },
  } as unknown as Express;

  setupPetrinautOptimizerHandler(app, { logger, origin: null });

  expect(registeredRoute).toEqual({
    handlerCount: 2,
    path: PETRINAUT_OPTIMIZER_OPTIMIZE_PATH,
  });
});

describe(PETRINAUT_OPTIMIZER_CAPABILITIES_PATH, () => {
  it("requires authentication", async () => {
    await expect(
      callGetHandler({
        authenticated: false,
        origin: null,
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
      }),
    ).resolves.toEqual({
      body: { optimization: false },
      statusCode: 200,
    });

    await expect(
      callGetHandler({
        origin: new URL("http://petrinaut-opt:4004"),
      }),
    ).resolves.toEqual({
      body: { optimization: true },
      statusCode: 200,
    });
  });
});
