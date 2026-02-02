/**
 * Tests for the useSimulationWorker hook.
 *
 * Uses a mock Worker to test the hook's message handling and state management.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SDCPN } from "../../core/types/sdcpn";
import type { ToMainMessage, ToWorkerMessage } from "./messages";
import { useSimulationWorker } from "./use-simulation-worker";

// Mock Worker
class MockWorker {
  onmessage: ((event: MessageEvent<ToMainMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postedMessages: ToWorkerMessage[] = [];

  postMessage(message: ToWorkerMessage): void {
    this.postedMessages.push(message);
  }

  terminate(): void {
    // No-op
  }

  // Helper to simulate worker sending a message back
  simulateMessage(message: ToMainMessage): void {
    if (this.onmessage) {
      this.onmessage({ data: message } as MessageEvent<ToMainMessage>);
    }
  }

  // Helper to simulate worker error
  simulateError(message: string): void {
    if (this.onerror) {
      this.onerror({ message } as ErrorEvent);
    }
  }

  // Helper to get last posted message
  getLastMessage(): ToWorkerMessage | undefined {
    return this.postedMessages[this.postedMessages.length - 1];
  }

  // Helper to get messages of a specific type
  getMessages<T extends ToWorkerMessage["type"]>(
    type: T,
  ): Extract<ToWorkerMessage, { type: T }>[] {
    return this.postedMessages.filter(
      (msg): msg is Extract<ToWorkerMessage, { type: T }> => msg.type === type,
    );
  }

  // Helper to clear messages
  clearMessages(): void {
    this.postedMessages = [];
  }
}

// Store the mock worker instance for access in tests
let mockWorkerInstance: MockWorker | null = null;

// Mock the Worker constructor
vi.stubGlobal(
  "Worker",
  class {
    constructor() {
      mockWorkerInstance = new MockWorker();
      // Assign to globalThis to make this instance available
      Object.assign(this, mockWorkerInstance);
    }
  },
);

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

describe("useSimulationWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWorkerInstance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("starts with idle status", () => {
      const { result } = renderHook(() => useSimulationWorker());

      expect(result.current.state.status).toBe("idle");
      expect(result.current.state.frames).toEqual([]);
      expect(result.current.state.error).toBeNull();
    });

    it("creates worker on mount", () => {
      renderHook(() => useSimulationWorker());

      expect(mockWorkerInstance).not.toBeNull();
    });
  });

  describe("initialize action", () => {
    it("sends init message to worker", () => {
      const { result } = renderHook(() => useSimulationWorker());
      const sdcpn = createMinimalSDCPN();
      const initialMarking = new Map([
        ["p1", { values: new Float64Array([1.0]), count: 1 }],
      ]);

      act(() => {
        result.current.actions.initialize({
          sdcpn,
          initialMarking,
          parameterValues: { param1: "1.0" },
          seed: 42,
          dt: 0.1,
        });
      });

      expect(result.current.state.status).toBe("initializing");

      const initMessages = mockWorkerInstance!.getMessages("init");
      expect(initMessages).toHaveLength(1);
      expect(initMessages[0]?.sdcpn).toBe(sdcpn);
      expect(initMessages[0]?.seed).toBe(42);
      expect(initMessages[0]?.dt).toBe(0.1);
    });

    it("serializes initialMarking Map to array", () => {
      const { result } = renderHook(() => useSimulationWorker());
      const sdcpn = createMinimalSDCPN();
      const initialMarking = new Map([
        ["p1", { values: new Float64Array([1.0, 2.0]), count: 2 }],
      ]);

      act(() => {
        result.current.actions.initialize({
          sdcpn,
          initialMarking,
          parameterValues: {},
          seed: 42,
          dt: 0.1,
        });
      });

      const initMessages = mockWorkerInstance!.getMessages("init");
      expect(initMessages[0]?.initialMarking).toBeInstanceOf(Array);
      expect(initMessages[0]?.initialMarking).toHaveLength(1);
      expect(initMessages[0]?.initialMarking[0]?.[0]).toBe("p1");
    });

    it("clears frames on initialize", () => {
      const { result } = renderHook(() => useSimulationWorker());

      // Simulate having some frames
      act(() => {
        mockWorkerInstance!.simulateMessage({
          type: "frame",
          frame: {
            time: 0,
            places: {},
            transitions: {},
            buffer: new Float64Array(),
          },
        });
      });

      expect(result.current.state.frames).toHaveLength(1);

      // Initialize again
      act(() => {
        result.current.actions.initialize({
          sdcpn: createMinimalSDCPN(),
          initialMarking: new Map(),
          parameterValues: {},
          seed: 42,
          dt: 0.1,
        });
      });

      expect(result.current.state.frames).toHaveLength(0);
    });
  });

  describe("start action", () => {
    it("sends start message and updates status", () => {
      const { result } = renderHook(() => useSimulationWorker());

      act(() => {
        result.current.actions.start();
      });

      expect(result.current.state.status).toBe("running");
      expect(mockWorkerInstance!.getMessages("start")).toHaveLength(1);
    });
  });

  describe("pause action", () => {
    it("sends pause message", () => {
      const { result } = renderHook(() => useSimulationWorker());

      act(() => {
        result.current.actions.pause();
      });

      expect(mockWorkerInstance!.getMessages("pause")).toHaveLength(1);
    });
  });

  describe("stop action", () => {
    it("sends stop message and resets state", () => {
      const { result } = renderHook(() => useSimulationWorker());

      // Start first
      act(() => {
        result.current.actions.start();
      });

      // Stop
      act(() => {
        result.current.actions.stop();
      });

      expect(mockWorkerInstance!.getMessages("stop")).toHaveLength(1);
      expect(result.current.state.status).toBe("idle");
      expect(result.current.state.frames).toEqual([]);
    });
  });

  describe("setMaxTime action", () => {
    it("sends setMaxTime message", () => {
      const { result } = renderHook(() => useSimulationWorker());

      act(() => {
        result.current.actions.setMaxTime(100);
      });

      const messages = mockWorkerInstance!.getMessages("setMaxTime");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.maxTime).toBe(100);
    });

    it("sends null maxTime", () => {
      const { result } = renderHook(() => useSimulationWorker());

      act(() => {
        result.current.actions.setMaxTime(null);
      });

      const messages = mockWorkerInstance!.getMessages("setMaxTime");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.maxTime).toBeNull();
    });
  });

  describe("reset action", () => {
    it("sends stop message and resets state", () => {
      const { result } = renderHook(() => useSimulationWorker());

      // Add some state
      act(() => {
        result.current.actions.start();
        mockWorkerInstance!.simulateMessage({
          type: "frame",
          frame: {
            time: 0,
            places: {},
            transitions: {},
            buffer: new Float64Array(),
          },
        });
      });

      // Reset
      act(() => {
        result.current.actions.reset();
      });

      expect(mockWorkerInstance!.getMessages("stop").length).toBeGreaterThan(0);
      expect(result.current.state.status).toBe("idle");
      expect(result.current.state.frames).toEqual([]);
    });
  });

  describe("message handling", () => {
    it("handles ready message", () => {
      const { result } = renderHook(() => useSimulationWorker());

      // Set status to initializing first
      act(() => {
        result.current.actions.initialize({
          sdcpn: createMinimalSDCPN(),
          initialMarking: new Map(),
          parameterValues: {},
          seed: 42,
          dt: 0.1,
        });
      });

      expect(result.current.state.status).toBe("initializing");

      // Simulate ready message
      act(() => {
        mockWorkerInstance!.simulateMessage({
          type: "ready",
          initialFrameCount: 1,
        });
      });

      expect(result.current.state.status).toBe("ready");
    });

    it("handles frame message", () => {
      const { result } = renderHook(() => useSimulationWorker());

      const frame = {
        time: 1.5,
        places: {
          p1: { offset: 0, count: 1, dimensions: 1 },
        },
        transitions: {},
        buffer: new Float64Array([1.0]),
      };

      act(() => {
        mockWorkerInstance!.simulateMessage({ type: "frame", frame });
      });

      expect(result.current.state.frames).toHaveLength(1);
      expect(result.current.state.frames[0]?.time).toBe(1.5);
    });

    it("handles frames (batch) message", () => {
      const { result } = renderHook(() => useSimulationWorker());

      const frames = [
        { time: 1, places: {}, transitions: {}, buffer: new Float64Array() },
        { time: 2, places: {}, transitions: {}, buffer: new Float64Array() },
        { time: 3, places: {}, transitions: {}, buffer: new Float64Array() },
      ];

      act(() => {
        mockWorkerInstance!.simulateMessage({ type: "frames", frames });
      });

      expect(result.current.state.frames).toHaveLength(3);
      expect(result.current.state.frames[0]?.time).toBe(1);
      expect(result.current.state.frames[2]?.time).toBe(3);
    });

    it("handles complete message", () => {
      const { result } = renderHook(() => useSimulationWorker());

      act(() => {
        result.current.actions.start();
      });

      act(() => {
        mockWorkerInstance!.simulateMessage({
          type: "complete",
          reason: "deadlock",
          frameNumber: 100,
        });
      });

      expect(result.current.state.status).toBe("complete");
    });

    it("handles paused message", () => {
      const { result } = renderHook(() => useSimulationWorker());

      act(() => {
        result.current.actions.start();
      });

      act(() => {
        mockWorkerInstance!.simulateMessage({
          type: "paused",
          frameNumber: 50,
        });
      });

      expect(result.current.state.status).toBe("paused");
    });

    it("handles error message", () => {
      const { result } = renderHook(() => useSimulationWorker());

      act(() => {
        mockWorkerInstance!.simulateMessage({
          type: "error",
          message: "Something went wrong",
          itemId: "item123",
        });
      });

      expect(result.current.state.status).toBe("error");
      expect(result.current.state.error).toBe("Something went wrong");
      expect(result.current.state.errorItemId).toBe("item123");
    });

    it("handles worker onerror", () => {
      const { result } = renderHook(() => useSimulationWorker());

      act(() => {
        mockWorkerInstance!.simulateError("Worker crashed");
      });

      expect(result.current.state.status).toBe("error");
      expect(result.current.state.error).toBe("Worker crashed");
    });
  });

  describe("backpressure (ack)", () => {
    it("sends periodic ack messages", () => {
      renderHook(() => useSimulationWorker());

      // Add some frames
      act(() => {
        mockWorkerInstance!.simulateMessage({
          type: "frame",
          frame: {
            time: 0,
            places: {},
            transitions: {},
            buffer: new Float64Array(),
          },
        });
      });

      mockWorkerInstance!.clearMessages();

      // Advance timers to trigger ack
      act(() => {
        vi.advanceTimersByTime(150); // > ACK_INTERVAL_MS (100)
      });

      const ackMessages = mockWorkerInstance!.getMessages("ack");
      expect(ackMessages.length).toBeGreaterThan(0);
      expect(ackMessages[0]?.frameNumber).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("terminates worker on unmount", () => {
      const terminateSpy = vi.fn();

      const { unmount } = renderHook(() => useSimulationWorker());

      // Replace terminate with spy
      mockWorkerInstance!.terminate = terminateSpy;

      unmount();

      expect(terminateSpy).toHaveBeenCalled();
    });
  });
});
