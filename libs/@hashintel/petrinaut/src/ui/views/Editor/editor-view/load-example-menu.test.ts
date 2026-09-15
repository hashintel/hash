import { describe, expect, test, vi } from "vitest";

import { ticketProcessingSDCPN } from "@hashintel/petrinaut-core/examples";

import { listLoadableExamples, loadExampleMenuItem } from "./load-example-menu";

describe("listLoadableExamples", () => {
  test("hides the status-view examples while the setting is off", () => {
    const texts = listLoadableExamples({ enableStatusViews: false }).map(
      (entry) => entry.text,
    );

    expect(texts).not.toContain("Ticket Processing");
    expect(texts).toContain("Deployment Pipeline");
    expect(texts).toContain("Production with Machine Failure");
  });

  test("lists Ticket Processing once the setting is on", () => {
    const withSetting = listLoadableExamples({ enableStatusViews: true });
    const withoutSetting = listLoadableExamples({ enableStatusViews: false });

    expect(withSetting.map((entry) => entry.text)).toContain(
      "Ticket Processing",
    );
    expect(withSetting).toHaveLength(withoutSetting.length + 1);
  });
});

describe("loadExampleMenuItem", () => {
  test("loads the chosen example through the callback", () => {
    const onLoadExample = vi.fn();
    const item = loadExampleMenuItem({
      enableStatusViews: true,
      onLoadExample,
    });

    expect(item).toMatchObject({ id: "load-example", text: "Load example" });
    if (!("subItems" in item) || item.subItems === undefined) {
      throw new Error("Expected Load example to open a submenu.");
    }
    const ticketProcessing = item.subItems.find(
      (subItem) => subItem.id === "load-example-ticket-processing",
    );
    if (
      ticketProcessing === undefined ||
      !("onClick" in ticketProcessing) ||
      ticketProcessing.onClick === undefined
    ) {
      throw new Error("Expected a Ticket Processing action.");
    }

    ticketProcessing.onClick("load-example-ticket-processing");
    expect(onLoadExample).toHaveBeenCalledExactlyOnceWith(
      ticketProcessingSDCPN,
    );
  });
});
