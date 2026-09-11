/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { useReadOnlyNodeDrag } from "./use-read-only-node-drag";

const notify = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../react/hooks/use-read-only-feedback", () => ({
  useReadOnlyFeedback: () => notify,
}));
afterEach(() => {
  cleanup();
  notify.mockClear();
});

const Canvas = ({ readonly = true }: { readonly?: boolean }) => {
  const handlers = useReadOnlyNodeDrag(readonly);
  return (
    <div {...handlers} data-testid="canvas">
      <div className="react-flow__node" data-testid="node">
        <span>Place</span>
        <button type="button">Inspect</button>
      </div>
      <div data-testid="pane">Canvas</div>
    </div>
  );
};

const pointer = (target: Element, type: string, x: number, button = 0) =>
  fireEvent(
    target,
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: 20, button }),
  );

test("notifies once per attempted node drag after the movement threshold", () => {
  render(<Canvas />);
  const node = screen.getByTestId("node");
  pointer(node, "pointerdown", 20);
  pointer(node, "pointermove", 24);
  expect(notify).not.toHaveBeenCalled();
  pointer(node, "pointermove", 30);
  pointer(node, "pointermove", 50);
  expect(notify).toHaveBeenCalledOnce();
});

test("keeps selection, pane panning, middle-button drags and controls quiet", () => {
  render(<Canvas />);
  const node = screen.getByTestId("node");
  pointer(node, "pointerdown", 20);
  pointer(node, "pointerup", 20);
  pointer(node, "pointermove", 80);
  for (const target of [
    screen.getByTestId("pane"),
    screen.getByRole("button"),
  ]) {
    pointer(target, "pointerdown", 20);
    pointer(target, "pointermove", 80);
  }
  pointer(node, "pointerdown", 20, 1);
  pointer(node, "pointermove", 80, 1);
  expect(notify).not.toHaveBeenCalled();
});

test("editable drags and canceled gestures stay quiet", () => {
  const view = render(<Canvas readonly={false} />);
  const node = screen.getByTestId("node");
  pointer(node, "pointerdown", 20);
  pointer(node, "pointermove", 80);
  view.rerender(<Canvas />);
  pointer(node, "pointerdown", 20);
  pointer(node, "pointercancel", 20);
  pointer(node, "pointermove", 80);
  expect(notify).not.toHaveBeenCalled();
});
