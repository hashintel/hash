/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ResizeHandle } from "./resize-handle";

afterEach(cleanup);

const renderHandle = (
  props: Partial<React.ComponentProps<typeof ResizeHandle>> = {},
) => {
  const getSize = vi.fn(() => 400);
  const onResize = vi.fn();
  const onResizeEnd = vi.fn();
  render(
    <ResizeHandle
      edge="left"
      label="Resize panel"
      getSize={getSize}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      minSize={300}
      maxSize={600}
      {...props}
    />,
  );
  return {
    handle: screen.getByRole("button", { name: "Resize panel" }),
    getSize,
    onResize,
    onResizeEnd,
  };
};

it("asks for the size once, when the drag starts", () => {
  const { handle, getSize } = renderHandle();

  expect(getSize).not.toHaveBeenCalled();

  fireEvent.mouseDown(handle, { clientX: 500 });
  fireEvent.mouseMove(document, { clientX: 480 });
  fireEvent.mouseMove(document, { clientX: 460 });

  expect(getSize).toHaveBeenCalledOnce();
});

it("reports each pointer move as a size, growing against the dragged edge", () => {
  const { handle, onResize } = renderHandle();

  fireEvent.mouseDown(handle, { clientX: 500 });
  fireEvent.mouseMove(document, { clientX: 450 });
  fireEvent.mouseMove(document, { clientX: 520 });

  expect(onResize.mock.calls).toEqual([[450], [380]]);
});

it("clamps the size to its bounds", () => {
  const { handle, onResize } = renderHandle();

  fireEvent.mouseDown(handle, { clientX: 500 });
  fireEvent.mouseMove(document, { clientX: 100 });
  fireEvent.mouseMove(document, { clientX: 900 });

  expect(onResize.mock.calls).toEqual([[600], [300]]);
});

it("reports the end of the drag once, and no move after it", () => {
  const { handle, onResize, onResizeEnd } = renderHandle();

  fireEvent.mouseDown(handle, { clientX: 500 });
  fireEvent.mouseMove(document, { clientX: 450 });

  expect(onResizeEnd).not.toHaveBeenCalled();

  fireEvent.mouseUp(document);
  fireEvent.mouseMove(document, { clientX: 400 });

  expect(onResizeEnd).toHaveBeenCalledOnce();
  expect(onResize).toHaveBeenCalledOnce();
});
