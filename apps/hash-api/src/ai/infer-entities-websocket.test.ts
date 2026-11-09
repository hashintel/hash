import { EventEmitter } from "node:events";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { openInferEntitiesWebSocket } from "./infer-entities-websocket";

import type { ImpureGraphContext } from "../graph/context-types";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { Client } from "@temporalio/client";
import type { IncomingMessage, Server } from "node:http";
import type { WebSocket } from "ws";

const mocks = vi.hoisted(() => ({
  serverOn: vi.fn(),
  getUserAndSession: vi.fn(),
  getFlowRuns: vi.fn(),
  getFlowRunEntityById: vi.fn(),
  handleCancelInferEntitiesRequest: vi.fn(),
  handleInferEntitiesRequest: vi.fn(),
  signal: vi.fn(),
}));

vi.mock("ws", () => ({
  WebSocketServer: class {
    on = mocks.serverOn;
  },
}));

vi.mock("../auth/create-auth-handlers", () => ({
  getUserAndSession: mocks.getUserAndSession,
}));

vi.mock("@local/hash-backend-utils/flows", () => ({
  getFlowRuns: mocks.getFlowRuns,
  getFlowRunEntityById: mocks.getFlowRunEntityById,
}));

vi.mock(
  "@local/hash-isomorphic-utils/flows/definitions/browser-plugin-flow-definitions",
  () => ({
    automaticBrowserInferenceFlow: { flowDefinition: { inputs: [] } },
    manualBrowserInferenceFlow: { flowDefinition: { inputs: [] } },
  }),
);

vi.mock("@local/hash-isomorphic-utils/flows/validate-payloads", () => ({
  validateFlowInputs: () => undefined,
}));

vi.mock("@local/hash-isomorphic-utils/flows/signals", () => ({
  externalInputResponseSignal: "externalInputResponse",
}));

vi.mock("../graphql/api-types.gen", () => ({
  FlowRunStatus: { Running: "RUNNING" },
}));

vi.mock(
  "./infer-entities-websocket/handle-cancel-infer-entities-request",
  () => ({
    handleCancelInferEntitiesRequest: mocks.handleCancelInferEntitiesRequest,
  }),
);

vi.mock("./infer-entities-websocket/handle-infer-entities-request", () => ({
  handleInferEntitiesRequest: mocks.handleInferEntitiesRequest,
}));

class TestSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState: number = this.OPEN;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.emit("close");
  });
}

const cookie = "ory_kratos_session=original";
const user = { accountId: "user-one", enabledFeatureFlags: ["ai"] };
const poll = { type: "check-for-external-input-requests" };
const sockets: TestSocket[] = [];

const authentication = (remainingMs = 60_000) => ({
  user,
  session: {
    id: "session-one",
    active: true,
    expires_at: new Date(Date.now() + remainingMs).toISOString(),
  },
});

const send = async (socket: TestSocket, message: object) => {
  socket.emit("message", Buffer.from(JSON.stringify(message)));
  await vi.advanceTimersByTimeAsync(0);
};

const connect = async (upgradeCookie?: string) => {
  openInferEntitiesWebSocket({
    context: { graphApi: {} } as ImpureGraphContext,
    httpServer: {} as Server,
    logger: {} as Logger,
    temporalClient: {
      workflow: { getHandle: () => ({ signal: mocks.signal }) },
    } as unknown as Client,
  });

  const onConnection = mocks.serverOn.mock.calls.at(-1)![1] as (
    socket: WebSocket,
    request: IncomingMessage,
  ) => void;
  const socket = new TestSocket();
  sockets.push(socket);
  onConnection(
    socket as unknown as WebSocket,
    {
      headers: { cookie: upgradeCookie },
      socket: { remoteAddress: "127.0.0.1" },
    } as IncomingMessage,
  );
  await vi.advanceTimersByTimeAsync(0);
  return socket;
};

const operations = [
  { message: poll, dispatch: mocks.getFlowRuns },
  {
    message: {
      type: "external-input-response",
      flowRunEntityId: "web~flow",
      payload: {},
    },
    dispatch: mocks.signal,
  },
  {
    message: {
      type: "cancel-inference-request",
      flowRunEntityId: "web~flow",
      requestUuid: "request",
    },
    dispatch: mocks.handleCancelInferEntitiesRequest,
  },
  ...["automatic-inference-request", "manual-inference-request"].map(
    (type) => ({
      message: { type, requestUuid: "request", payload: {} },
      dispatch: mocks.handleInferEntitiesRequest,
    }),
  ),
];

const expectRejected = (socket: TestSocket) => {
  expect(socket.close).toHaveBeenCalledWith(1008, "Unauthenticated");
  expect(mocks.getFlowRuns).not.toHaveBeenCalled();
  expect(mocks.getFlowRunEntityById).not.toHaveBeenCalled();
  expect(mocks.signal).not.toHaveBeenCalled();
  expect(mocks.handleCancelInferEntitiesRequest).not.toHaveBeenCalled();
  expect(mocks.handleInferEntitiesRequest).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  vi.resetAllMocks();
  mocks.getUserAndSession.mockResolvedValue(authentication());
  mocks.getFlowRuns.mockResolvedValue({ flowRuns: [] });
  mocks.getFlowRunEntityById.mockResolvedValue({
    properties: {
      "https://hash.ai/@h/types/property-type/workflow-id/": "flow",
    },
  });
});

afterEach(() => {
  for (const socket of sockets.splice(0)) {
    if (socket.readyState === socket.OPEN) {
      socket.close();
    }
  }
  vi.useRealTimers();
});

describe.each(["upgrade", "first-message"])("%s authentication", (method) => {
  const authenticatedSocket = async () => {
    const socket = await connect(method === "upgrade" ? cookie : undefined);
    if (method === "first-message") {
      await send(socket, { ...poll, cookie });
    }
    vi.clearAllMocks();
    return socket;
  };

  describe.each(["revoked", "expired"])("%s session", (failure) => {
    it.each(operations)(
      "rejects $message.type",
      async ({ message, dispatch }) => {
        const socket = await authenticatedSocket();
        await send(socket, message);
        expect(dispatch).toHaveBeenCalledOnce();
        expect(socket.close).not.toHaveBeenCalled();
        vi.clearAllMocks();

        mocks.getUserAndSession.mockResolvedValue(
          failure === "revoked" ? {} : authentication(-1),
        );
        await send(socket, message);

        expect(mocks.getUserAndSession).toHaveBeenCalledWith(
          expect.objectContaining({ cookie }),
        );
        expectRejected(socket);
      },
    );
  });

  it("outlives the unauthenticated timeout but closes at session expiry", async () => {
    const socket = await authenticatedSocket();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(55_000);
    expectRejected(socket);
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("still times out unauthenticated sockets, even with pings", async () => {
  const socket = await connect();
  socket.emit("message", Buffer.from("ping"));
  await vi.advanceTimersByTimeAsync(4_999);
  expect(socket.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expectRejected(socket);
});

it("handles the configured 30-day session lifetime without timer overflow", async () => {
  const lifetime = 30 * 24 * 60 * 60 * 1_000;
  mocks.getUserAndSession.mockResolvedValue(authentication(lifetime));
  const socket = await connect(cookie);
  await vi.advanceTimersByTimeAsync(2_147_483_647);
  expect(socket.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(lifetime - 2_147_483_647);
  expectRejected(socket);
});

it("validates and retains refreshed credentials for the same user", async () => {
  const socket = await connect(cookie);
  const refreshedCookie = "ory_kratos_session=refreshed";
  mocks.getUserAndSession.mockResolvedValue(authentication(120_000));
  await send(socket, { ...poll, cookie: refreshedCookie });
  expect(mocks.getUserAndSession).toHaveBeenLastCalledWith(
    expect.objectContaining({ cookie: refreshedCookie }),
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(socket.close).not.toHaveBeenCalled();

  await send(socket, poll);
  expect(mocks.getUserAndSession).toHaveBeenLastCalledWith(
    expect.objectContaining({ cookie: refreshedCookie }),
  );
  expect(mocks.getFlowRuns).toHaveBeenLastCalledWith(
    expect.objectContaining({ authentication: { actorId: user.accountId } }),
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(socket.close).toHaveBeenCalledWith(1008, "Unauthenticated");
});

it.each(["invalid", "different-user"])(
  "rejects %s refreshed credentials",
  async (failure) => {
    const socket = await connect(cookie);
    mocks.getUserAndSession.mockResolvedValue(
      failure === "invalid"
        ? {}
        : { ...authentication(), user: { ...user, accountId: "user-two" } },
    );
    await send(socket, { ...poll, cookie: "ory_kratos_session=replacement" });
    expectRejected(socket);
  },
);

it("fails closed when live session validation throws", async () => {
  const socket = await connect(cookie);
  mocks.getUserAndSession.mockRejectedValue(new Error("Kratos unavailable"));
  await send(socket, poll);
  expectRejected(socket);
});

it("does not dispatch or revive a socket when validation finishes after expiry", async () => {
  const socket = await connect(cookie);
  let finishValidation!: (value: ReturnType<typeof authentication>) => void;
  mocks.getUserAndSession.mockReturnValueOnce(
    new Promise((resolve) => {
      finishValidation = resolve;
    }),
  );
  await send(socket, poll);
  await vi.advanceTimersByTimeAsync(60_000);
  finishValidation(authentication());
  await vi.advanceTimersByTimeAsync(0);
  expectRejected(socket);
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans up both timeouts when a socket closes", async () => {
  const socket = await connect(cookie);
  socket.close();
  expect(vi.getTimerCount()).toBe(0);
});
