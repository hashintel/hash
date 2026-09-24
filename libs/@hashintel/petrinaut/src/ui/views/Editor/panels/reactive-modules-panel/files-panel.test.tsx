/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FilesPanel, groupFiles } from "./files-panel";

afterEach(cleanup);

const files = [
  { path: "net.py", text: "net" },
  { path: "draw_go.py", text: "draw" },
  { path: "transition_go.py", text: "go" },
  { path: "place_a.py", text: "a" },
  { path: "place_b.py", text: "b" },
];

describe("groupFiles", () => {
  test("puts the main file first, then the modules by kind", () => {
    expect(
      groupFiles([...files, { path: "helper.py", text: "" }]).map((group) => [
        group.label,
        group.files.map((file) => file.path),
      ]),
    ).toEqual([
      [null, ["net.py"]],
      ["Transitions", ["transition_go.py"]],
      ["Places", ["place_a.py", "place_b.py"]],
      ["Draws", ["draw_go.py"]],
      ["Modules", ["helper.py"]],
    ]);
    expect(groupFiles([])).toEqual([]);
  });
});

describe("FilesPanel", () => {
  test("lists the files under their kind, marks the shown one and selects on click", () => {
    const onSelect = vi.fn();
    render(
      <FilesPanel
        files={files}
        selected="place_a.py"
        onSelect={onSelect}
        open
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Files" });
    expect(nav.textContent).toContain("Transitions");
    expect(nav.textContent).toContain("Places");
    expect(nav.textContent).toContain("Draws");
    const items = screen.getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual([
      "net.py",
      "transition_go.py",
      "place_a.py",
      "place_b.py",
      "draw_go.py",
    ]);
    expect(screen.getByTitle("place_a.py").getAttribute("aria-current")).toBe(
      "true",
    );
    const main = screen.getByTitle("net.py");
    expect(main.hasAttribute("aria-current")).toBe(false);
    expect(main.getAttribute("data-main")).toBe("true");
    fireEvent.click(screen.getByTitle("transition_go.py"));
    expect(onSelect).toHaveBeenCalledWith("transition_go.py");
  });

  test("closes to nothing and makes the list inert", () => {
    render(
      <FilesPanel
        files={files}
        selected="net.py"
        onSelect={() => {}}
        open={false}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Files" });
    expect(nav.getAttribute("data-open")).toBe("false");
    expect(nav.firstElementChild?.hasAttribute("inert")).toBe(true);
  });
});
