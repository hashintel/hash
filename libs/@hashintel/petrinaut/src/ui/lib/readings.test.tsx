/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { motionValue } from "motion";
import { Profiler } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { styleRef, useReading, watch } from "./readings";
import { nextFrame } from "./readings.test-helpers";

const width = motionValue(450);
const height = motionValue(180);
const panelStyle = { width, bottom: () => height.get() + 12 };

type Total = { total: number };
const total = (): Total => ({ total: width.get() + height.get() });
const sameTotal = (previous: Total, next: Total) =>
  previous.total === next.total;

beforeEach(() => {
  width.set(450);
  height.set(180);
});
afterEach(cleanup);

it("writes the style when the element attaches", () => {
  render(<div data-testid="panel" ref={styleRef(panelStyle)} />);

  expect(screen.getByTestId("panel").style.width).toBe("450px");
  expect(screen.getByTestId("panel").style.bottom).toBe("192px");
});

it("follows a value and a computed reading without rendering the component", async () => {
  const onRender = vi.fn();
  render(
    <Profiler id="panel" onRender={onRender}>
      <div data-testid="panel" ref={styleRef(panelStyle)} />
    </Profiler>,
  );
  onRender.mockClear();

  width.set(520);
  height.set(240);
  await nextFrame();

  expect(screen.getByTestId("panel").style.width).toBe("520px");
  expect(screen.getByTestId("panel").style.bottom).toBe("252px");
  expect(onRender).not.toHaveBeenCalled();
});

it("writes a custom property as the reading gives it", () => {
  render(
    <div
      data-testid="panel"
      ref={styleRef({ "--panel-width": () => `${width.get()}px` })}
    />,
  );

  expect(
    screen.getByTestId("panel").style.getPropertyValue("--panel-width"),
  ).toBe("450px");
});

it("leaves the properties React sets on the same element", async () => {
  render(
    <div
      data-testid="panel"
      style={{ right: 12 }}
      ref={styleRef(panelStyle)}
    />,
  );

  width.set(520);
  await nextFrame();

  expect(screen.getByTestId("panel").style.right).toBe("12px");
});

it("stops following once the element detaches", async () => {
  const { unmount } = render(
    <div data-testid="panel" ref={styleRef(panelStyle)} />,
  );
  const panel = screen.getByTestId("panel");

  unmount();
  width.set(520);
  height.set(240);
  await nextFrame();

  expect(panel.style.width).toBe("450px");
  expect(panel.style.bottom).toBe("192px");
});

it("tells the watcher of a Motion value at once", () => {
  const listener = vi.fn();
  const stop = watch(width, listener);

  width.set(520);
  expect(listener).toHaveBeenCalledExactlyOnceWith(520);

  stop();
  width.set(600);
  expect(listener).toHaveBeenCalledOnce();
});

it("works a computed reading out once per frame and tells of a change only", async () => {
  const listener = vi.fn();
  const stop = watch(total, listener, sameTotal);

  width.set(500);
  height.set(200);
  await nextFrame();
  expect(listener).toHaveBeenCalledExactlyOnceWith({ total: 700 });

  // Two changes that leave the result as it was.
  width.set(499);
  height.set(201);
  await nextFrame();
  expect(listener).toHaveBeenCalledOnce();

  stop();
  width.set(900);
  await nextFrame();
  expect(listener).toHaveBeenCalledOnce();
});

it("renders a component with a Motion value and again when it changes", () => {
  const { result } = renderHook(() => useReading(width));
  expect(result.current).toBe(450);

  act(() => width.set(520));

  expect(result.current).toBe(520);
});

it("keeps a computed object's identity until it says something else", async () => {
  const { result, rerender } = renderHook(() => useReading(total, sameTotal));
  const first = result.current;
  expect(first).toEqual({ total: 630 });

  rerender();
  expect(result.current).toBe(first);

  await act(async () => {
    width.set(451);
    height.set(179);
    await nextFrame();
  });
  expect(result.current).toBe(first);

  await act(async () => {
    width.set(500);
    await nextFrame();
  });
  expect(result.current).toEqual({ total: 679 });
});
