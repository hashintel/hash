/**
 * Tests for the simulation WebWorker.
 *
 * These tests run the worker logic in isolation by mocking the global
 * `self` and `postMessage` functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkerMessageEnvelope } from "../../environment";
import type { SDCPN } from "../../types/sdcpn";
import type { ToMainMessage, ToWorkerMessage } from "./messages";

// Store messages posted by worker
let postedMessages: ToMainMessage[] = [];

// Store the message handler
let messageHandler:
  | ((event: WorkerMessageEnvelope<ToWorkerMessage>) => void)
  | null = null;

// Mock self.postMessage and message subscriptions.
const mockSelf = {
  postMessage: (message: ToMainMessage) => {
    postedMessages.push(message);
  },
  addEventListener(
    _type: "message",
    handler: (event: WorkerMessageEnvelope<ToWorkerMessage>) => void,
  ) {
    messageHandler = handler;
  },
};

// Helper to simulate sending a message to the worker
function sendToWorker(message: ToWorkerMessage): void {
  if (messageHandler) {
    messageHandler({ data: message });
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
    it("does not post ready before init", () => {
      const readyMessages = getMessages("ready");
      expect(readyMessages).toHaveLength(0);
    });

    it("initializes simulation with valid SDCPN", () => {
      clearMessages();

      const sdcpn = createMinimalSDCPN();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: { p1: [{ x: 1.0 }] },
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      });

      // Should send initial frame and ready message
      const frameMessages = getMessages("frame");
      expect(frameMessages).toHaveLength(1);
      expect(frameMessages[0]?.frame.time).toBe(0);

      const readyMessages = getMessages("ready");
      expect(readyMessages).toHaveLength(1);
      expect(readyMessages[0]?.initialFrameCount).toBe(1);
    });

    it("ships initial-marking strings as an append-only pool delta", () => {
      clearMessages();

      const sdcpn = createMinimalSDCPN();
      sdcpn.types[0]!.elements.push({
        elementId: "e2",
        name: "label",
        type: "string",
      });
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: {
          p1: [
            { x: 1.0, label: "alpha" },
            { x: 2.0, label: "beta" },
            { x: 3.0, label: "alpha" },
          ],
        },
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      });

      const frameMessages = getMessages("frame");
      expect(frameMessages).toHaveLength(1);
      // baseId 1: "" (id 0) is pre-seeded on both sides; equal strings share
      // one entry.
      expect(frameMessages[0]?.frame.newStrings).toEqual({
        baseId: 1,
        values: ["alpha", "beta"],
      });

      // Re-init starts a fresh pool: the delta counter resets too.
      clearMessages();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: { p1: [{ x: 1.0, label: "gamma" }] },
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      });
      expect(getMessages("frame")[0]?.frame.newStrings).toEqual({
        baseId: 1,
        values: ["gamma"],
      });
    });

    it("omits the pool delta when the net has no string elements", () => {
      clearMessages();

      sendToWorker({
        type: "init",
        sdcpn: createMinimalSDCPN(),
        initialMarking: { p1: [{ x: 1.0 }] },
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      });

      const frameMessages = getMessages("frame");
      expect(frameMessages).toHaveLength(1);
      expect(frameMessages[0]?.frame.newStrings).toBeUndefined();
    });

    it("posts error message for invalid SDCPN", () => {
      clearMessages();

      // SDCPN with invalid initial marking (place doesn't exist)
      const sdcpn = createMinimalSDCPN();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: { nonexistent: [{ x: 1.0 }] },
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
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
        initialMarking: { p1: [{ x: 1.0 }] },
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
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
        initialMarking: { p1: [{ x: 1.0 }] },
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
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

  describe("backpressure", () => {
    it("accepts setBackpressure message", () => {
      clearMessages();

      // Initialize
      const sdcpn = createMinimalSDCPN();
      sendToWorker({
        type: "init",
        sdcpn,
        initialMarking: { p1: [{ x: 1.0 }] },
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      });
      clearMessages();

      // Set backpressure config - should not error
      sendToWorker({
        type: "setBackpressure",
        maxFramesAhead: 50000,
        batchSize: 500,
      });

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
        initialMarking: { p1: [{ x: 1.0 }] },
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      });
      clearMessages();

      // Send ack - should not error
      sendToWorker({ type: "ack", frameNumber: 100 });

      const errorMessages = getMessages("error");
      expect(errorMessages).toHaveLength(0);
    });
  });
});
