/**
 * Tests for the useSimulationWorker hook.
 *
 * Uses a mock Worker to test the hook's message handling and state management.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SDCPN } from "../../core/types/sdcpn";
import type { ToMainMessage, ToWorkerMessage } from "./messages";
import { useSimulationWorker } from "./use-simulation-worker";

// Mock Worker with addEventListener-based API
class MockWorker {
  private messageListeners: ((event: MessageEvent<ToMainMessage>) => void)[] =
    [];

  private errorListeners: ((event: ErrorEvent) => void)[] = [];

  postedMessages: ToWorkerMessage[] = [];

  addEventListener(type: string, listener: (event: never) => void): void {
    if (type === "message") {
      this.messageListeners.push(
        listener as (event: MessageEvent<ToMainMessage>) => void,
      );
    } else if (type === "error") {
      this.errorListeners.push(listener as (event: ErrorEvent) => void);
    }
  }

  postMessage(message: ToWorkerMessage): void {
    this.postedMessages.push(message);
  }

  terminate(): void {
    // No-op
  }

  simulateMessage(message: ToMainMessage): void {
    const event = { data: message } as MessageEvent<ToMainMessage>;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }

  simulateError(message: string): void {
    const event = { message } as ErrorEvent;
    for (const listener of this.errorListeners) {
      listener(event);
    }
  }

  getLastMessage(): ToWorkerMessage | undefined {
    return this.postedMessages[this.postedMessages.length - 1];
  }

  getMessages<T extends ToWorkerMessage["type"]>(
    type: T,
  ): Extract<ToWorkerMessage, { type: T }>[] {
    return this.postedMessages.filter(
      (msg): msg is Extract<ToWorkerMessage, { type: T }> => msg.type === type,
    );
  }

  clearMessages(): void {
    this.postedMessages = [];
  }
}

// Store the mock worker instance for access in tests
let mockWorkerInstance: MockWorker | null = null;

// Mock the extracted createSimulationWorker module so the dynamic import
// (with ?worker&inline) never runs. Returns a MockWorker synchronously
// via a resolved promise, eliminating all async timing issues.
vi.mock("./create-simulation-worker", () => ({
  createSimulationWorker: () => {
    mockWorkerInstance = new MockWorker();
    return Promise.resolve(mockWorkerInstance);
  },
}));

// Flush the resolved Promise.then() callback from createSimulationWorker.
// The promise resolves synchronously (our mock), but the .then() in the
// useEffect still runs as a microtask — one await act() is sufficient.
async function flushMicrotasks() {
  await act(async () => {});
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

describe("useSimulationWorker", () => {
  beforeEach(() => {
    mockWorkerInstance = null;
  });

  describe("initial state", () => {
    it("starts with idle status", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      expect(result.current.state.status).toBe("idle");
      expect(result.current.state.frames).toEqual([]);
      expect(result.current.state.error).toBeNull();
    });

    it("creates worker on mount", async () => {
      renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      expect(mockWorkerInstance).not.toBeNull();
    });
  });

  describe("initialize action", () => {
    it("sends init message to worker", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      const sdcpn = createMinimalSDCPN();
      const initialMarking = new Map([
        ["p1", { values: new Float64Array([1.0]), count: 1 }],
      ]);

      act(() => {
        void result.current.actions.initialize({
          sdcpn,
          initialMarking,
          parameterValues: { param1: "1.0" },
          seed: 42,
          dt: 0.1,
          maxTime: 100,
        });
      });

      expect(result.current.state.status).toBe("initializing");

      const initMessages = mockWorkerInstance!.getMessages("init");
      expect(initMessages).toHaveLength(1);
      expect(initMessages[0]?.sdcpn).toBe(sdcpn);
      expect(initMessages[0]?.seed).toBe(42);
      expect(initMessages[0]?.dt).toBe(0.1);
      expect(initMessages[0]?.maxTime).toBe(100);
    });

    it("serializes initialMarking Map to array", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      const sdcpn = createMinimalSDCPN();
      const initialMarking = new Map([
        ["p1", { values: new Float64Array([1.0, 2.0]), count: 2 }],
      ]);

      act(() => {
        void result.current.actions.initialize({
          sdcpn,
          initialMarking,
          parameterValues: {},
          seed: 42,
          dt: 0.1,
          maxTime: null,
        });
      });

      const initMessages = mockWorkerInstance!.getMessages("init");
      expect(initMessages[0]?.initialMarking).toBeInstanceOf(Array);
      expect(initMessages[0]?.initialMarking).toHaveLength(1);
      expect(initMessages[0]?.initialMarking[0]?.[0]).toBe("p1");
    });

    it("clears frames on initialize", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

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
        void result.current.actions.initialize({
          sdcpn: createMinimalSDCPN(),
          initialMarking: new Map(),
          parameterValues: {},
          seed: 42,
          dt: 0.1,
          maxTime: null,
        });
      });

      expect(result.current.state.frames).toHaveLength(0);
    });
  });

  describe("start action", () => {
    it("sends start message and updates status", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      act(() => {
        result.current.actions.start();
      });

      expect(result.current.state.status).toBe("running");
      expect(mockWorkerInstance!.getMessages("start")).toHaveLength(1);
    });
  });

  describe("pause action", () => {
    it("sends pause message", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      act(() => {
        result.current.actions.pause();
      });

      expect(mockWorkerInstance!.getMessages("pause")).toHaveLength(1);
    });
  });

  describe("stop action", () => {
    it("sends stop message and resets state", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      act(() => {
        result.current.actions.start();
      });

      act(() => {
        result.current.actions.stop();
      });

      expect(mockWorkerInstance!.getMessages("stop")).toHaveLength(1);
      expect(result.current.state.status).toBe("idle");
      expect(result.current.state.frames).toEqual([]);
    });
  });

  describe("setBackpressure action", () => {
    it("sends setBackpressure message with maxFramesAhead", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      act(() => {
        result.current.actions.setBackpressure({ maxFramesAhead: 50000 });
      });

      const messages = mockWorkerInstance!.getMessages("setBackpressure");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.maxFramesAhead).toBe(50000);
    });

    it("sends setBackpressure message with batchSize", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      act(() => {
        result.current.actions.setBackpressure({ batchSize: 500 });
      });

      const messages = mockWorkerInstance!.getMessages("setBackpressure");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.batchSize).toBe(500);
    });
  });

  describe("reset action", () => {
    it("sends stop message and resets state", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

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

      act(() => {
        result.current.actions.reset();
      });

      expect(mockWorkerInstance!.getMessages("stop").length).toBeGreaterThan(0);
      expect(result.current.state.status).toBe("idle");
      expect(result.current.state.frames).toEqual([]);
    });
  });

  describe("message handling", () => {
    it("handles ready message", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      act(() => {
        void result.current.actions.initialize({
          sdcpn: createMinimalSDCPN(),
          initialMarking: new Map(),
          parameterValues: {},
          seed: 42,
          dt: 0.1,
          maxTime: null,
        });
      });

      expect(result.current.state.status).toBe("initializing");

      act(() => {
        mockWorkerInstance!.simulateMessage({
          type: "ready",
          initialFrameCount: 1,
        });
      });

      expect(result.current.state.status).toBe("ready");
    });

    it("handles frame message", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

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

    it("handles frames (batch) message", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

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

    it("handles complete message", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

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

    it("handles paused message", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

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

    it("handles error message", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

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

    it("handles worker onerror", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      act(() => {
        mockWorkerInstance!.simulateError("Worker crashed");
      });

      expect(result.current.state.status).toBe("error");
      expect(result.current.state.error).toBe("Worker crashed");
    });
  });

  describe("backpressure (ack)", () => {
    it("sends ack message when ack action is called", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      mockWorkerInstance!.clearMessages();

      act(() => {
        result.current.actions.ack(42);
      });

      const ackMessages = mockWorkerInstance!.getMessages("ack");
      expect(ackMessages.length).toBe(1);
      expect(ackMessages[0]?.frameNumber).toBe(42);
    });

    it("sends multiple ack messages with different frame numbers", async () => {
      const { result } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      mockWorkerInstance!.clearMessages();

      act(() => {
        result.current.actions.ack(10);
        result.current.actions.ack(20);
        result.current.actions.ack(30);
      });

      const ackMessages = mockWorkerInstance!.getMessages("ack");
      expect(ackMessages.length).toBe(3);
      expect(ackMessages[0]?.frameNumber).toBe(10);
      expect(ackMessages[1]?.frameNumber).toBe(20);
      expect(ackMessages[2]?.frameNumber).toBe(30);
    });
  });

  describe("cleanup", () => {
    it("terminates worker on unmount", async () => {
      const terminateSpy = vi.fn();

      const { unmount } = renderHook(() => useSimulationWorker());
      await flushMicrotasks();

      // Replace terminate with spy
      mockWorkerInstance!.terminate = terminateSpy;

      unmount();

      expect(terminateSpy).toHaveBeenCalled();
    });
  });
});
