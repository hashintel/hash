/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { Collapse } from "./collapse";

afterEach(cleanup);

const finishTransition = (element: Element, propertyName: string) => {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: propertyName });
  fireEvent(element, event);
};

it("retains closing content until the height transition ends and handles reversal", () => {
  const { container, rerender } = render(
    <Collapse open animate>
      <button type="button">Content</button>
    </Collapse>,
  );
  const wrapper = container.firstElementChild;
  if (!wrapper) throw new Error("Missing collapse wrapper");
  rerender(
    <Collapse open={false} animate>
      <button type="button">Content</button>
    </Collapse>,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Content")).toBeTruthy();
  finishTransition(wrapper, "opacity");
  expect(screen.getByText("Content")).toBeTruthy();
  rerender(
    <Collapse open animate>
      <button type="button">Content</button>
    </Collapse>,
  );
  finishTransition(wrapper, "grid-template-rows");
  expect(screen.getByRole("button")).toBeTruthy();
  rerender(
    <Collapse open={false} animate>
      <button type="button">Content</button>
    </Collapse>,
  );
  finishTransition(wrapper, "grid-template-rows");
  expect(screen.queryByText("Content")).toBeNull();
});

it("removes closing content immediately when motion is disabled", () => {
  const { rerender } = render(
    <Collapse open animate>
      <span>Content</span>
    </Collapse>,
  );
  rerender(
    <Collapse open={false} animate>
      <span>Content</span>
    </Collapse>,
  );
  rerender(
    <Collapse open={false} animate={false}>
      <span>Content</span>
    </Collapse>,
  );
  expect(screen.queryByText("Content")).toBeNull();
});
