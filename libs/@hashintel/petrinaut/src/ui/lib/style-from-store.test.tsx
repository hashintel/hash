/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import { styleFromStore } from "./style-from-store";

afterEach(cleanup);

const width = createReadableStore(450);
const toWidth = (value: number) => ({ width: `${value}px` });

it("writes the value when the element attaches", () => {
  width.set(450);
  render(<div data-testid="panel" ref={styleFromStore(width, toWidth)} />);

  expect(screen.getByTestId("panel").style.width).toBe("450px");
});

it("follows the store without rendering the component", () => {
  width.set(450);
  const onRender = vi.fn();
  render(
    <Profiler id="panel" onRender={onRender}>
      <div data-testid="panel" ref={styleFromStore(width, toWidth)} />
    </Profiler>,
  );
  onRender.mockClear();

  width.set(520);

  expect(screen.getByTestId("panel").style.width).toBe("520px");
  expect(onRender).not.toHaveBeenCalled();
});

it("leaves the properties React sets on the same element", () => {
  width.set(450);
  render(
    <div
      data-testid="panel"
      style={{ bottom: 12 }}
      ref={styleFromStore(width, toWidth)}
    />,
  );

  width.set(520);

  expect(screen.getByTestId("panel").style.bottom).toBe("12px");
});

it("stops following once the element detaches", () => {
  width.set(450);
  const { unmount } = render(
    <div data-testid="panel" ref={styleFromStore(width, toWidth)} />,
  );
  const panel = screen.getByTestId("panel");

  unmount();
  width.set(520);

  expect(panel.style.width).toBe("450px");
});
