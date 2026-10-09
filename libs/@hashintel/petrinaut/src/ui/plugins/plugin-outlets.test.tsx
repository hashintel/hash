/** @vitest-environment jsdom */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { definePetrinautPlugin } from "./define-petrinaut-plugin";
import { PluginToolbarItems } from "./plugin-outlets";
import { renderPlugins } from "./plugins-test-harness";

afterEach(cleanup);

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
