/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { portInHandleId } from "./port-handles";
import { useLinkRewiring } from "./use-link-rewiring";

import type { CanvasInteractions } from "../../../use-canvas-interactions";
import type {
  Connection,
  Edge,
  FinalConnectionState,
  OnReconnect,
} from "@xyflow/react";

const interactions = {
  readonly: false,
  isValidConnection: vi.fn(() => true),
  canRewireLink: vi.fn(() => true),
  rewireLink: vi.fn(),
};
/** Whether React Flow still has the gesture in progress. */
const gesture = { live: true };
const pane = document.createElement("div");
pane.className = "react-flow__pane";

beforeEach(() => {
  vi.clearAllMocks();
  document.elementFromPoint = () => pane;
  gesture.live = true;
});
afterEach(cleanup);

const link = { id: "fusion:belt:m1", source: "buffer", target: "m1" } as Edge;
const pointer = new MouseEvent("mouseup");
const dropped = (toHandle: FinalConnectionState["toHandle"]) =>
  ({ toHandle }) as FinalConnectionState;
/** The connection React Flow builds when the link's target end lands on M2's port. */
const ontoM2: Connection = {
  source: "buffer",
  sourceHandle: null,
  target: "m2",
  targetHandle: portInHandleId("in"),
};

const renderRewiring = (readonly = false) => {
  const { isValidConnection, reconnectProps } = renderHook(() =>
    useLinkRewiring(
      { ...interactions, readonly } as unknown as CanvasInteractions,
      () => gesture.live,
    ),
  ).result.current;
  return {
    isValidConnection,
    // The end React Flow names is the one that stays.
    start: () =>
      reconnectProps.onReconnectStart?.(pointer as never, link, "source"),
    reconnect: reconnectProps.onReconnect as OnReconnect | undefined,
    end: (state: FinalConnectionState) =>
      reconnectProps.onReconnectEnd?.(pointer, link, "source", state),
  };
};

describe("useLinkRewiring", () => {
  it("checks a connection as an arc or a fusion until a link's end is picked up", () => {
    const { isValidConnection, start, end } = renderRewiring();

    isValidConnection(ontoM2);
    expect(interactions.isValidConnection).toHaveBeenCalledOnce();

    start();
    isValidConnection(ontoM2);
    expect(interactions.canRewireLink).toHaveBeenCalledWith({
      linkId: link.id,
      end: "target",
      onto: { nodeId: "m2", portId: "in" },
    });

    end(dropped(null));
    isValidConnection(ontoM2);
    expect(interactions.isValidConnection).toHaveBeenCalledTimes(2);
  });

  it("moves the end to the handle it is dropped on", () => {
    const { start, reconnect, end } = renderRewiring();

    start();
    reconnect?.(link, ontoM2);
    end(dropped({ nodeId: "m2" } as FinalConnectionState["toHandle"]));

    expect(interactions.rewireLink).toHaveBeenCalledExactlyOnceWith({
      linkId: link.id,
      end: "target",
      onto: { nodeId: "m2", portId: "in" },
    });
  });

  it("detaches the end dropped on the empty canvas, and leaves one dropped elsewhere", () => {
    const { start, end } = renderRewiring();

    start();
    end(dropped(null));
    expect(interactions.rewireLink).toHaveBeenCalledExactlyOnceWith({
      linkId: link.id,
      end: "target",
      onto: null,
    });

    document.elementFromPoint = () => document.body;
    start();
    end(dropped(null));
    expect(interactions.rewireLink).toHaveBeenCalledOnce();
  });

  it("changes nothing when Escape cancelled the gesture before its end is reported", () => {
    const { start, reconnect, end } = renderRewiring();

    start();
    gesture.live = false;
    reconnect?.(link, ontoM2);
    end(dropped(null));

    expect(interactions.rewireLink).not.toHaveBeenCalled();
  });

  it("offers no end to drag while the net is read-only", () => {
    expect(renderRewiring(true).reconnect).toBeUndefined();
  });
});
