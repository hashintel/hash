import { describe, expect, it } from "vitest";

import {
  getPetrinautOptimizerOrigin,
  PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
  PETRINAUT_OPTIMIZER_OPTIMIZE_RUN_EVENTS_PATH,
  PETRINAUT_OPTIMIZER_OPTIMIZE_RUN_PATH,
  PETRINAUT_OPTIMIZER_OPTIMIZE_RUNS_PATH,
  setupPetrinautOptimizerHandler,
} from "./setup-petrinaut-optimizer-handler";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { Express, Request, Response as ExpressResponse } from "express";

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
};
const logger = {
  ...noopLogger,
  child: () => noopLogger,
} as unknown as Pick<Logger, "child" | "info" | "warn">;

type Handler = (
  request: Request,
  response: ExpressResponse,
) => Promise<void> | void;

type RegisteredRoute = {
  handlerCount: number;
  method: "delete" | "get" | "post";
  path: string;
};

/** Build an Express fake that records every route registration in order. */
const createRecordingApp = () => {
  const routes: RegisteredRoute[] = [];
  const handlers = new Map<string, Handler>();
  const register =
    (method: RegisteredRoute["method"]) =>
    (path: string, ...routeHandlers: unknown[]) => {
      routes.push({ handlerCount: routeHandlers.length, method, path });
      handlers.set(`${method} ${path}`, routeHandlers.at(-1) as Handler);
    };
  const app = {
    delete: register("delete"),
    get: register("get"),
    post: register("post"),
  } as unknown as Express;
  return { app, handlers, routes };
};

const callGetHandler = async ({
  authenticated = true,
  origin,
}: {
  authenticated?: boolean;
  origin: URL | null;
}) => {
  const { app, handlers } = createRecordingApp();
  setupPetrinautOptimizerHandler(app, { logger, origin });
  const handler = handlers.get(`get ${PETRINAUT_OPTIMIZER_CAPABILITIES_PATH}`);
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

it("mounts every optimization endpoint behind the rate limiter", () => {
  const { app, routes } = createRecordingApp();

  setupPetrinautOptimizerHandler(app, { logger, origin: null });

  expect(routes).toEqual([
    {
      handlerCount: 1,
      method: "get",
      path: PETRINAUT_OPTIMIZER_CAPABILITIES_PATH,
    },
    {
      handlerCount: 2,
      method: "post",
      path: PETRINAUT_OPTIMIZER_OPTIMIZE_RUNS_PATH,
    },
    {
      handlerCount: 2,
      method: "get",
      path: PETRINAUT_OPTIMIZER_OPTIMIZE_RUN_EVENTS_PATH,
    },
    {
      handlerCount: 2,
      method: "delete",
      path: PETRINAUT_OPTIMIZER_OPTIMIZE_RUN_PATH,
    },
  ]);
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
