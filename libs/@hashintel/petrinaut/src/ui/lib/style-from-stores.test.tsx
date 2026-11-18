/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import { styleFromStores } from "./style-from-stores";

const width = createReadableStore(450);
const height = createReadableStore(180);
const toSize = (sizes: { width: number; height: number }) => ({
  width: `${sizes.width}px`,
  bottom: `${sizes.height + 12}px`,
});

beforeEach(() => {
  width.set(450);
  height.set(180);
});
afterEach(cleanup);

it("writes the style when the element attaches", () => {
  render(
    <div
      data-testid="panel"
      ref={styleFromStores({ width, height }, toSize)}
    />,
  );

  expect(screen.getByTestId("panel").style.width).toBe("450px");
  expect(screen.getByTestId("panel").style.bottom).toBe("192px");
});

it("follows each store without rendering the component", () => {
  const onRender = vi.fn();
  render(
    <Profiler id="panel" onRender={onRender}>
      <div
        data-testid="panel"
        ref={styleFromStores({ width, height }, toSize)}
      />
    </Profiler>,
  );
  onRender.mockClear();

  width.set(520);
  height.set(240);

  expect(screen.getByTestId("panel").style.width).toBe("520px");
  expect(screen.getByTestId("panel").style.bottom).toBe("252px");
  expect(onRender).not.toHaveBeenCalled();
});

it("leaves the properties React sets on the same element", () => {
  render(
    <div
      data-testid="panel"
      style={{ right: 12 }}
      ref={styleFromStores({ width, height }, toSize)}
    />,
  );

  width.set(520);

  expect(screen.getByTestId("panel").style.right).toBe("12px");
});

it("stops following once the element detaches", () => {
  const { unmount } = render(
    <div
      data-testid="panel"
      ref={styleFromStores({ width, height }, toSize)}
    />,
  );
  const panel = screen.getByTestId("panel");

  unmount();
  width.set(520);

  expect(panel.style.width).toBe("450px");
});
