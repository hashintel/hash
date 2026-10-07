import { describe, expect, it } from "vitest";

import { definePetrinautPlugin } from "./define-petrinaut-plugin";
import { resolvePluginStatuses } from "./plugin-statuses";

const createPlugin = (id: string) =>
  definePetrinautPlugin({ id, name: id })({});

describe("resolvePluginStatuses", () => {
  it("keeps the host's order and marks plugins switched off or failed", () => {
    const first = createPlugin("test.first");
    const second = createPlugin("test.second");
    const third = createPlugin("test.third");

    expect(
      resolvePluginStatuses(
        [first, second, third],
        ["test.second"],
        new Set([third.hostKey]),
      ).map(({ plugin, status }) => [plugin.manifest.id, status]),
    ).toEqual([
      ["test.first", "on"],
      ["test.second", "off"],
      ["test.third", "failed"],
    ]);
  });

  it("runs a re-created plugin whose predecessor failed", () => {
    const failed = createPlugin("test.reloaded");

    expect(
      resolvePluginStatuses(
        [createPlugin("test.reloaded")],
        [],
        new Set([failed.hostKey]),
      ).map(({ status }) => status),
    ).toEqual(["on"]);
  });

  it("refuses an id passed twice", () => {
    expect(() =>
      resolvePluginStatuses(
        [createPlugin("test.twice"), createPlugin("test.twice")],
        [],
        new Set(),
      ),
    ).toThrow('Petrinaut plugin "test.twice" is passed twice.');
  });
});
