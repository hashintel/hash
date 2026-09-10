import { describe, expect, test, vi } from "vitest";

import { createNewNetMenuItem } from "./create-new-net-menu";

describe("createNewNetMenuItem", () => {
  test("keeps a single New action when no assistant is mounted", () => {
    const onStartBlank = vi.fn();
    const item = createNewNetMenuItem({
      hasAiAssistant: false,
      onBuildWithBrunch: vi.fn(),
      onStartBlank,
    });

    expect(item).toMatchObject({
      id: "new",
      text: "New",
    });
    expect(item).not.toHaveProperty("subItems");
    if (!("onClick" in item) || item.onClick === undefined) {
      throw new Error("Expected a direct New action.");
    }
    item.onClick("new");
    expect(onStartBlank).toHaveBeenCalledOnce();
  });

  test("offers Build with Brunch or Start blank when an assistant is mounted", () => {
    const onBuildWithBrunch = vi.fn();
    const onStartBlank = vi.fn();
    const item = createNewNetMenuItem({
      hasAiAssistant: true,
      onBuildWithBrunch,
      onStartBlank,
    });

    expect(item).toMatchObject({
      id: "new",
      text: "New",
    });
    if (!("subItems" in item) || item.subItems === undefined) {
      throw new Error("Expected New to open a submenu.");
    }
    expect(item.subItems).toEqual([
      expect.objectContaining({
        id: "new-build-with-brunch",
        text: "Build with Brunch",
      }),
      expect.objectContaining({
        id: "new-start-blank",
        text: "Start blank",
      }),
    ]);

    const buildItem = item.subItems[0];
    const blankItem = item.subItems[1];
    if (
      buildItem === undefined ||
      blankItem === undefined ||
      !("onClick" in buildItem) ||
      !("onClick" in blankItem) ||
      buildItem.onClick === undefined ||
      blankItem.onClick === undefined
    ) {
      throw new Error("Expected both create-new submenu actions.");
    }

    buildItem.onClick("new-build-with-brunch");
    blankItem.onClick("new-start-blank");
    expect(onBuildWithBrunch).toHaveBeenCalledOnce();
    expect(onStartBlank).toHaveBeenCalledOnce();
  });
});
