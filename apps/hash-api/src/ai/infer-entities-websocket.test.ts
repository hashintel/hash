import { once } from "node:events";
import { createServer, request } from "node:http";

import express from "express";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { WebSocket } from "ws";

import { openInferEntitiesWebSocket } from "./infer-entities-websocket";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { AddressInfo, Socket } from "node:net";

// Keep external services out of these tests; the HTTP and ws servers are real.
vi.mock("@local/hash-backend-utils/flows", () => ({
  getFlowRunEntityById: vi.fn(),
  getFlowRuns: vi.fn(),
}));
vi.mock("../auth/create-auth-handlers", () => ({
  getUserAndSession: vi.fn().mockResolvedValue({}),
}));
vi.mock(
  "./infer-entities-websocket/handle-cancel-infer-entities-request",
  () => ({
    handleCancelInferEntitiesRequest: vi.fn(),
  }),
);
vi.mock("./infer-entities-websocket/handle-infer-entities-request", () => ({
  handleInferEntitiesRequest: vi.fn(),
}));

describe("infer-entities WebSocket protocol errors", () => {
  it.each([
    {
      name: "an invalid opcode before authentication",
      // FIN + reserved opcode 3, masked empty payload with a zero mask.
      frame: Buffer.from([0x83, 0x80, 0, 0, 0, 0]),
      code: "WS_ERR_INVALID_OPCODE",
      existingConnections: 1,
    },
    {
      name: "invalid UTF-8 before authentication",
      // FIN + text opcode, masked one-byte payload with a zero mask.
      frame: Buffer.from([0x81, 0x81, 0, 0, 0, 0, 0xff]),
      code: "WS_ERR_INVALID_UTF8",
      existingConnections: 1,
    },
    {
      name: "an invalid opcode on a connection rejected by the IP limit",
      frame: Buffer.from([0x83, 0x80, 0, 0, 0, 0]),
      code: "WS_ERR_INVALID_OPCODE",
      existingConnections: 10,
    },
  ])(
    "isolates $name to the offending socket",
    async ({ frame, code, existingConnections }) => {
      const app = express();
      // Representative health and API routes on the same server as the socket.
      app.get("/", (_req, res) => {
        res.json({ status: "pass" });
      });
      app.get("/api/test", (_req, res) => {
        res.json({ ok: true });
      });

      const httpServer = createServer(app);
      const connections = new Set<Socket>();
      httpServer.on("connection", (socket) => {
        connections.add(socket);
        socket.once("close", () => {
          connections.delete(socket);
        });
      });

      onTestFinished(async () => {
        await Promise.all(
          [...connections].map(async (socket) => {
            const closed = once(socket, "close");
            socket.destroy();
            await closed;
          }),
        );
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
      });

      const error = vi.fn();
      openInferEntitiesWebSocket({
        context: {} as never,
        httpServer,
        logger: { error } as unknown as Logger,
        temporalClient: {} as never,
      });
      httpServer.listen(0, "127.0.0.1");
      await once(httpServer, "listening");
      const { port } = httpServer.address() as AddressInfo;
      const url = `http://127.0.0.1:${port}`;

      const unaffectedSockets = await Promise.all(
        Array.from({ length: existingConnections }, async () => {
          const socket = new WebSocket(`ws://127.0.0.1:${port}`);
          await once(socket, "open");
          return socket;
        }),
      );

      // Use a raw transport because ws clients won't send invalid frames.
      await new Promise<void>((resolve, reject) => {
        const upgradeRequest = request(url, {
          headers: {
            connection: "Upgrade",
            upgrade: "websocket",
            "sec-websocket-version": "13",
            "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
          },
        });
        upgradeRequest.once("error", reject);
        upgradeRequest.once("response", (response) => {
          response.resume();
          reject(new Error("Expected a WebSocket upgrade"));
        });
        upgradeRequest.once("upgrade", (_response, socket) => {
          socket.once("error", reject);
          socket.once("close", () => resolve());
          socket.resume();
          socket.write(frame);
        });
        upgradeRequest.end();
      });

      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith("Infer-entities WebSocket error", {
        error: expect.objectContaining({ code }),
        ipAddress: "127.0.0.1",
      });

      await Promise.all(
        unaffectedSockets.map(async (socket) => {
          const pong = once(socket, "pong");
          socket.ping();
          await pong;
        }),
      );

      const [healthResponse, apiResponse] = await Promise.all([
        fetch(url),
        fetch(`${url}/api/test`),
      ]);
      expect(healthResponse.status).toBe(200);
      expect(await healthResponse.json()).toEqual({ status: "pass" });
      expect(apiResponse.status).toBe(200);
      expect(await apiResponse.json()).toEqual({ ok: true });
    },
  );
});
