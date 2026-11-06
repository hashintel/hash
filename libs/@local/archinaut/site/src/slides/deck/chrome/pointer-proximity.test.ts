import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { observePointerProximity } from "./pointer-proximity";

describe("pointer proximity", () => {
  let target: EventTarget;
  let disconnect: () => void;
  const onChange = vi.fn();
  const element = {
    getBoundingClientRect: () =>
      ({ left: 420, right: 580, top: 760, bottom: 800 }) as DOMRect,
  };
  const move = (x: number, y: number, pointerType = "mouse", buttons = 0) => {
    target.dispatchEvent(
      Object.assign(new Event("pointermove"), {
        clientX: x,
        clientY: y,
        pointerType,
        buttons,
      }),
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();
    onChange.mockClear();
    target = new EventTarget();
    vi.stubGlobal("window", {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
    });
    disconnect = observePointerProximity(element, onChange, {
      radius: 0,
      settleMs: 300,
    });
  });

  afterEach(() => {
    disconnect();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("opens after a pause at the handle", () => {
    move(500, 780);
    vi.advanceTimersByTime(299);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("opens during a slow approach", () => {
    move(450, 780);
    for (let step = 1; step <= 3; step++) {
      move(450 + step * 8, 780);
      vi.advanceTimersByTime(100);
    }
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("ignores a fast pass and cancels the pending wait on exit", () => {
    move(430, 780);
    vi.advanceTimersByTime(50);
    move(570, 780);
    vi.advanceTimersByTime(50);
    move(700, 780);
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalledWith(true);
  });

  it("waits for fast movement within the activation area to settle", () => {
    move(440, 780);
    for (let step = 0; step < 6; step++) {
      move(step % 2 === 0 ? 560 : 440, 780);
      vi.advanceTimersByTime(100);
    }
    expect(onChange).not.toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("ignores the rest of the bottom edge, touch, and dragging", () => {
    move(30, 795);
    vi.advanceTimersByTime(400);
    move(500, 780, "touch");
    vi.advanceTimersByTime(400);
    move(500, 780, "mouse", 1);
    vi.advanceTimersByTime(400);
    expect(onChange).not.toHaveBeenCalledWith(true);
  });

  it.each(["blur", "resize", "pointerdown", "pointerout"])(
    "cancels pending activation on %s",
    (type) => {
      move(500, 780);
      vi.advanceTimersByTime(200);
      target.dispatchEvent(
        Object.assign(new Event(type), { relatedTarget: null }),
      );
      vi.advanceTimersByTime(400);
      expect(onChange).not.toHaveBeenCalledWith(true);
    },
  );

  it("releases the timer and listeners on cleanup", () => {
    move(500, 780);
    disconnect();
    move(500, 780);
    vi.advanceTimersByTime(400);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reveals nearby corner controls immediately and hides them on exit", () => {
    disconnect();
    disconnect = observePointerProximity(element, onChange, { radius: 80 });
    move(400, 730);
    expect(onChange).toHaveBeenLastCalledWith(true);
    target.dispatchEvent(new Event("pointerdown"));
    expect(onChange).toHaveBeenLastCalledWith(true);
    move(200, 500);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("allows browsing the open panel after entering through the center", () => {
    disconnect();
    const panel = {
      getBoundingClientRect: () =>
        ({ left: 0, right: 1000, top: 544, bottom: 800 }) as DOMRect,
    };
    disconnect = observePointerProximity(
      element,
      onChange,
      { radius: 0, settleMs: 300 },
      panel,
    );
    move(100, 700);
    vi.advanceTimersByTime(400);
    expect(onChange).not.toHaveBeenCalledWith(true);
    move(500, 780);
    vi.advanceTimersByTime(300);
    move(100, 700);
    expect(onChange).toHaveBeenLastCalledWith(true);
    move(100, 400);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  describe("close grace period", () => {
    beforeEach(() => {
      disconnect();
      const panel = {
        getBoundingClientRect: () =>
          ({ left: 0, right: 1000, top: 544, bottom: 800 }) as DOMRect,
      };
      disconnect = observePointerProximity(
        element,
        onChange,
        { radius: 0, settleMs: 300, leaveMs: 400 },
        panel,
      );
      move(500, 780);
      vi.advanceTimersByTime(300);
    });

    it("closes 400 ms after leaving, even while the pointer keeps moving outside", () => {
      move(100, 400);
      vi.advanceTimersByTime(200);
      move(200, 400);
      vi.advanceTimersByTime(199);
      expect(onChange).toHaveBeenLastCalledWith(true);
      vi.advanceTimersByTime(1);
      expect(onChange).toHaveBeenLastCalledWith(false);
    });

    it("cancels closing when the pointer returns to any part of the panel", () => {
      move(100, 400);
      vi.advanceTimersByTime(350);
      move(100, 700);
      vi.advanceTimersByTime(600);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
      move(100, 400);
      vi.advanceTimersByTime(400);
      expect(onChange).toHaveBeenLastCalledWith(false);
    });

    it("also tolerates briefly leaving the browser", () => {
      target.dispatchEvent(
        Object.assign(new Event("pointerout"), { relatedTarget: null }),
      );
      vi.advanceTimersByTime(399);
      expect(onChange).toHaveBeenLastCalledWith(true);
      vi.advanceTimersByTime(1);
      expect(onChange).toHaveBeenLastCalledWith(false);
    });

    it("cancels the pending close on cleanup", () => {
      move(100, 400);
      disconnect();
      vi.advanceTimersByTime(400);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    });
  });
});
