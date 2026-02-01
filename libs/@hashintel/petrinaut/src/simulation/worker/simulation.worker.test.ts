/**
 * Tests for the simulation WebWorker.
 *
 * These tests run the worker logic in isolation by mocking the global
 * `self` and `postMessage` functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SDCPN } from "../../core/types/sdcpn";
import type { ToMainMessage, ToWorkerMessage } from "./messages";

// Store messages posted by worker
let postedMessages: ToMainMessage[] = [];

// Store the message handler
let messageHandler: ((event: MessageEvent<ToWorkerMessage>) => void) | null =
  null;

// Mock self.postMessage and self.onmessage
const mockSelf = {
  postMessage: (message: ToMainMessage) => {
    postedMessages.push(message);
  },
  set onmessage(handler:
    | ((event: MessageEvent<ToWorkerMessage>) => void)
    | null,) {
    messageHandler = handler;
  },
  get onmessage() {
    return messageHandler;
  },
};

// Helper to simulate sending a message to the worker
function sendToWorker(message: ToWorkerMessage): void {
  if (messageHandler) {
    messageHandler({ data: message } as MessageEvent<ToWorkerMessage>);
  }
}

// Helper to get messages of a specific type
function getMessages<T extends ToMainMessage["type"]>(
  type: T,
): Extract<ToMainMessage, { type: T }>[] {
  return postedMessages.filter(
    (msg): msg is Extract<ToMainMessage, { type: T }> => msg.type === type,
  );
}

// Helper to clear messages
function clearMessages(): void {
  postedMessages = [];
}

// Helper to create a minimal valid SDCPN
function createMinimalSDCPN(): SDCPN {
  return {
    types: [
      {
        id: "type1",
        name: "Type1",
        iconSlug: "circle",
        displayColor: "#FF0000",
        elements: [{ elementId: "e1", name: "x", type: "real" }],
      },
    ],
    differentialEquations: [],
    parameters: [],
    places: [
      {
        id: "p1",
        name: "Place1",
        colorId: "type1",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      },
    ],
    transitions: [],
  };
}

describe("simulation.worker", () => {
  beforeEach(async () => {
    // Reset state
    postedMessages = [];
    messageHandler = null;

    // Mock global self
    vi.stubGlobal("self", mockSelf);

    // Import worker module fresh (resets worker state)
    vi.resetModules();
    await import("./simulation.worker");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("initialization", () => {
    it("posts ready message on load", () => {
      // Worker posts ready on load
      const readyMessages = getMessages("ready");
      expect(readyMessages).toHaveLength(1);
      expect(readyMessages[0]?.initialFrameCount).toBe(0);
    });

    it("initializes simulation with valid SDCPN", () => {
      clearMessages();

      const sdcpn = createMinimalSDCPN();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: [["p1", { values: new Float64Array([1.0]), count: 1 }]],
        parameterValues: {},
        seed: 42,
        dt: 0.1,
      });

      // Should send initial frame and ready message
      const frameMessages = getMessages("frame");
      expect(frameMessages).toHaveLength(1);
      expect(frameMessages[0]?.frame.time).toBe(0);

      const readyMessages = getMessages("ready");
      expect(readyMessages).toHaveLength(1);
      expect(readyMessages[0]?.initialFrameCount).toBe(1);
    });

    it("posts error message for invalid SDCPN", () => {
      clearMessages();

      // SDCPN with invalid initial marking (place doesn't exist)
      const sdcpn = createMinimalSDCPN();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: [
          ["nonexistent", { values: new Float64Array([1.0]), count: 1 }],
        ],
        parameterValues: {},
        seed: 42,
        dt: 0.1,
      });

      const errorMessages = getMessages("error");
      expect(errorMessages).toHaveLength(1);
      expect(errorMessages[0]?.message).toContain("nonexistent");
    });
  });

  describe("start/pause/stop", () => {
    it("posts error when starting without init", () => {
      clearMessages();

      sendToWorker({ type: "start" });

      const errorMessages = getMessages("error");
      expect(errorMessages).toHaveLength(1);
      expect(errorMessages[0]?.message).toContain("not initialized");
    });

    it("posts paused message when pausing", () => {
      clearMessages();

      // Initialize first
      const sdcpn = createMinimalSDCPN();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: [["p1", { values: new Float64Array([1.0]), count: 1 }]],
        parameterValues: {},
        seed: 42,
        dt: 0.1,
      });
      clearMessages();

      // Pause
      sendToWorker({ type: "pause" });

      const pausedMessages = getMessages("paused");
      expect(pausedMessages).toHaveLength(1);
      expect(pausedMessages[0]?.frameNumber).toBe(0);
    });

    it("clears state on stop", () => {
      clearMessages();

      // Initialize
      const sdcpn = createMinimalSDCPN();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: [["p1", { values: new Float64Array([1.0]), count: 1 }]],
        parameterValues: {},
        seed: 42,
        dt: 0.1,
      });
      clearMessages();

      // Stop
      sendToWorker({ type: "stop" });

      // Try to start - should fail because simulation was cleared
      sendToWorker({ type: "start" });

      const errorMessages = getMessages("error");
      expect(errorMessages).toHaveLength(1);
      expect(errorMessages[0]?.message).toContain("not initialized");
    });
  });

  describe("maxTime", () => {
    it("accepts setMaxTime message", () => {
      clearMessages();

      // Initialize
      const sdcpn = createMinimalSDCPN();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: [["p1", { values: new Float64Array([1.0]), count: 1 }]],
        parameterValues: {},
        seed: 42,
        dt: 0.1,
      });
      clearMessages();

      // Set max time - should not error
      sendToWorker({ type: "setMaxTime", maxTime: 10.0 });

      const errorMessages = getMessages("error");
      expect(errorMessages).toHaveLength(0);
    });
  });

  describe("ack (backpressure)", () => {
    it("accepts ack message", () => {
      clearMessages();

      // Initialize
      const sdcpn = createMinimalSDCPN();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: [["p1", { values: new Float64Array([1.0]), count: 1 }]],
        parameterValues: {},
        seed: 42,
        dt: 0.1,
      });
      clearMessages();

      // Send ack - should not error
      sendToWorker({ type: "ack", frameNumber: 100 });

      const errorMessages = getMessages("error");
      expect(errorMessages).toHaveLength(0);
    });
  });
});
