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
    const list = screen.getByRole("listbox", { name: "Files" });
    expect(
      screen
        .getByRole("group", { name: "Transitions" })
        .contains(screen.getByTitle("transition_go.py")),
    ).toBe(true);
    expect(screen.getByRole("group", { name: "Places" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "Draws" })).not.toBeNull();
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.title)).toEqual([
      "net.py",
      "transition_go.py",
      "place_a.py",
      "place_b.py",
      "draw_go.py",
    ]);
    expect(screen.getByTitle("place_a.py").getAttribute("aria-selected")).toBe(
      "true",
    );
    const main = screen.getByTitle("net.py");
    expect(main.getAttribute("aria-selected")).toBe("false");
    expect(main.getAttribute("data-main")).toBe("true");
    expect(list.contains(main)).toBe(true);
    fireEvent.click(screen.getByTitle("transition_go.py"));
    expect(onSelect).toHaveBeenCalledWith("transition_go.py");
  });

  test("is one Tab stop whose arrows walk and show the files", () => {
    const onSelect = vi.fn();
    render(
      <FilesPanel files={files} selected="net.py" onSelect={onSelect} open />,
    );
    const options = screen.getAllByRole("option");
    expect(options.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    const main = screen.getByTitle("net.py");
    main.focus();
    fireEvent.keyDown(main, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTitle("transition_go.py"));
    expect(onSelect).toHaveBeenLastCalledWith("transition_go.py");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTitle("place_a.py"));
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("place_a.py");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByTitle("transition_go.py"));
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
    const list = screen.getByRole("listbox", { name: "Files" });
    expect(list.parentElement?.getAttribute("data-open")).toBe("false");
    expect(list.hasAttribute("inert")).toBe(true);
  });
});
