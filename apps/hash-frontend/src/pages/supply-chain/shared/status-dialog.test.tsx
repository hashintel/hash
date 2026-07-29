// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatusDialog } from "./status-dialog";

vi.mock("@hashintel/ds-components", () => ({
  Select: ({
    htmlForId,
    items,
    onChange,
    value,
  }: {
    htmlForId: string;
    items: Array<{ value: string; text: string }>;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <select
      id={htmlForId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.text}
        </option>
      ))}
    </select>
  ),
  usePortalContainerRef: () => null,
}));

vi.mock("./telemetry", () => ({
  trackSupplyChainInteraction: vi.fn(),
}));

describe("StatusDialog", () => {
  afterEach(cleanup);

  it("shows previous updates in chronological order", () => {
    render(
      <StatusDialog
        title="QA hold"
        entries={[
          {
            at: "2026-02-02T12:00:00.000Z",
            user: "Later user",
            category: "Investigation update",
            text: "Later comment",
          },
          {
            at: "2026-01-01T12:00:00.000Z",
            user: "Earlier user",
            category: "Investigation started",
            text: "",
          },
        ]}
        inline
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const updates = screen.getAllByRole("article");
    expect(
      screen
        .getByRole("region", { name: "Previous status updates" })
        .getAttribute("tabindex"),
    ).toBe("0");
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe(
      "Investigation update",
    );
    expect(updates[0]?.textContent).toContain("Earlier user");
    expect(updates[0]?.textContent).toContain("(no comment)");
    expect(updates[1]?.textContent).toContain("Later comment");
  });

  it("uses the selected status and validates its required comment", () => {
    const onSave = vi.fn();
    render(
      <StatusDialog title="QA hold" inline onClose={vi.fn()} onSave={onSave} />,
    );
    expect(screen.queryByText("Previous updates")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "Investigation concluded" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));

    expect(screen.getByText("Add a comment for this status.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Issue resolved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));

    expect(onSave).toHaveBeenCalledWith({
      category: "Investigation concluded",
      text: "Issue resolved",
    });
  });
});
