/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FilesPanel } from "./files-panel";

afterEach(cleanup);

const files = [
  { path: "net.py", text: "net" },
  { path: "place_a.py", text: "a" },
  { path: "transition_go.py", text: "go" },
];

describe("FilesPanel", () => {
  test("lists the files, marks the shown one and selects on click", () => {
    const onSelect = vi.fn();
    render(
      <FilesPanel
        files={files}
        selected="place_a.py"
        onSelect={onSelect}
        open
        onOpenChange={() => {}}
      />,
    );
    const items = screen.getAllByRole("button", { name: /\.py$/ });
    expect(items.map((item) => item.textContent)).toEqual([
      "net.py",
      "place_a.py",
      "transition_go.py",
    ]);
    expect(
      screen
        .getByRole("button", { name: "place_a.py" })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "net.py" })
        .hasAttribute("aria-current"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "transition_go.py" }));
    expect(onSelect).toHaveBeenCalledWith("transition_go.py");
    expect(screen.getByText("3")).not.toBeNull();
  });

  test("collapses to its toggle and expands again", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <FilesPanel
        files={files}
        selected="net.py"
        onSelect={() => {}}
        open
        onOpenChange={onOpenChange}
      />,
    );
    const panel = screen.getByRole("navigation", { name: "Files" });
    expect(panel.getAttribute("data-open")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Collapse files" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(
      <FilesPanel
        files={files}
        selected="net.py"
        onSelect={() => {}}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );
    expect(panel.getAttribute("data-open")).toBe("false");
    expect(screen.getByRole("list").hasAttribute("inert")).toBe(true);
    const expand = screen.getByRole("button", { name: "Expand files" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });
});
