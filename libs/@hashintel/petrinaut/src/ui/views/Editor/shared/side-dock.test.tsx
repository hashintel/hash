/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { afterEach, expect, test } from "vitest";

import {
  SideDockColumn,
  SideDockProvider,
  useSideDockContainer,
} from "./side-dock";

afterEach(cleanup);

const DockedPanel = () => {
  const container = useSideDockContainer();
  if (container === undefined) {
    return <aside aria-label="In place" />;
  }
  if (container === null) {
    return null;
  }
  return createPortal(<aside aria-label="Docked" />, container);
};

test("renders a docked panel into the column, after the workspace", () => {
  render(
    <SideDockProvider>
      <main>Workspace</main>
      <SideDockColumn />
      <DockedPanel />
    </SideDockProvider>,
  );
  const column = screen.getByRole("complementary", {
    name: "Docked",
  }).parentElement!;
  expect(column.hasAttribute("data-side-dock")).toBe(true);
  expect(column.previousElementSibling).toBe(screen.getByRole("main"));
  expect(screen.queryByRole("complementary", { name: "In place" })).toBeNull();
});

test("leaves a panel in place outside a provider", () => {
  render(<DockedPanel />);
  expect(
    screen.getByRole("complementary", { name: "In place" }),
  ).not.toBeNull();
});
