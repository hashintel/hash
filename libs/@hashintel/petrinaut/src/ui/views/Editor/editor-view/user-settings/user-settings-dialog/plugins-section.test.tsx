/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { PluginsTable } from "./plugins-section";

afterEach(cleanup);

it("opens a plugin's details on ArrowRight from its line, and closes them on ArrowLeft", () => {
  render(
    <PluginsTable
      rows={[
        {
          manifest: {
            id: "test.notes",
            name: "Notes",
            description: "Keeps notes beside the net.",
          },
          status: "on",
        },
      ]}
    />,
  );
  const line = screen.getByRole("button", { name: "Notes" });
  const expanded = () => line.getAttribute("aria-expanded");
  expect(expanded()).toBe("false");

  line.focus();
  fireEvent.keyDown(line, { key: "ArrowRight" });
  expect(expanded()).toBe("true");
  expect(document.activeElement).toBe(line);

  fireEvent.keyDown(line, { key: "ArrowLeft" });
  expect(expanded()).toBe("false");
  expect(document.activeElement).toBe(line);

  // The switch does not fold the row.
  const toggle = screen.getByRole("checkbox");
  toggle.focus();
  fireEvent.keyDown(toggle, { key: "ArrowRight" });
  expect(expanded()).toBe("false");
});
