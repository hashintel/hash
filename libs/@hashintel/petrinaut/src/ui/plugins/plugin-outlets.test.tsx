/** @vitest-environment jsdom */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { definePetrinautPlugin } from "./define-petrinaut-plugin";
import {
  PluginToolbarItems,
  usePluginBottomPanelViews,
} from "./plugin-outlets";
import { renderPlugins } from "./plugins-test-harness";

afterEach(cleanup);

/** Every view the plugins add, drawn in order: its tab, its content, its header action. */
const BottomPanelViews = () =>
  usePluginBottomPanelViews().map((view) => (
    <section key={view.id} aria-label={view.title} data-tab={view.id}>
      <p>{view.tooltip}</p>
      {view.content}
      {view.headerAction}
    </section>
  ));

describe("usePluginBottomPanelViews", () => {
  const logPlugin = definePetrinautPlugin(
    {
      id: "test.log",
      name: "Log",
      bottomPanelViews: {
        log: { title: "Log", tooltip: "What ran" },
        hidden: { title: "Hidden" },
      },
    },
    {
      bottomPanelViews: {
        log: {
          content: "Nothing ran",
          headerAction: <button type="button">Clear</button>,
        },
        hidden: { content: "Withheld", when: false },
      },
    },
  );
  const notesPlugin = definePetrinautPlugin(
    {
      id: "test.notes",
      name: "Notes",
      bottomPanelViews: { notes: { title: "Notes" } },
    },
    { bottomPanelViews: { notes: { content: "Nothing noted" } } },
  );

  it("lists the views that show, in plugin order, under their plugin's id", () => {
    renderPlugins([logPlugin, notesPlugin], <BottomPanelViews />);

    expect(
      [...document.querySelectorAll<HTMLElement>("[data-tab]")].map((tab) => [
        tab.getAttribute("aria-label"),
        tab.dataset.tab,
        tab.textContent,
      ]),
    ).toEqual([
      ["Log", "test.log.log", "What ranNothing ranClear"],
      ["Notes", "test.notes.notes", "Nothing noted"],
    ]);
  });

  it("draws nothing of a view whose content throws, and leaves the others", () => {
    const Broken = (): never => {
      throw new Error("The view broke.");
    };
    const brokenPlugin = definePetrinautPlugin(
      {
        id: "test.broken",
        name: "Broken",
        bottomPanelViews: { broken: { title: "Broken" } },
      },
      { bottomPanelViews: { broken: { content: <Broken /> } } },
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderPlugins([brokenPlugin, notesPlugin], <BottomPanelViews />);

    expect(screen.getByRole("region", { name: "Broken" }).textContent).toBe("");
    expect(screen.getByRole("region", { name: "Notes" }).textContent).toBe(
      "Nothing noted",
    );
  });
});

describe("PluginToolbarItems", () => {
  it("passes a button's ref and adds its className to the toolbar's", () => {
    const attach = vi.fn();
    const reportPlugin = definePetrinautPlugin({
      id: "test.report",
      name: "Report",
      buttons: { report: { label: "Report", place: "viewport-controls" } },
    })({
      buttons: { report: { icon: null, className: "report", ref: attach } },
    });

    renderPlugins(
      [reportPlugin],
      <PluginToolbarItems place="viewport-controls" buttonClassName="chrome" />,
    );

    const button = screen.getByRole("button", { name: "Report" });
    expect(attach).toHaveBeenCalledWith(button);
    expect(button.classList).toContain("report");
    expect(button.classList).toContain("chrome");
  });
});
