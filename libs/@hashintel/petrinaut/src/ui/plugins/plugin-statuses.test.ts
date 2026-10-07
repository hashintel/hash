import { describe, expect, it } from "vitest";

import { definePetrinautPlugin } from "./define-petrinaut-plugin";
import {
  isAssistantActiveFor,
  resolveActiveAssistantId,
  resolvePluginStatuses,
} from "./plugin-statuses";

const createPlugin = (id: string) =>
  definePetrinautPlugin({ id, name: id })({});

const createAssistant = definePetrinautPlugin({
  id: "test.assistant",
  name: "Assistant",
  assistant: { label: "Assistant" },
});
const createOther = definePetrinautPlugin({
  id: "test.other",
  name: "Other",
  assistant: { label: "Other" },
});
const createExtension = definePetrinautPlugin({
  id: "test.extension",
  name: "Extension",
  assistant: { extends: createAssistant },
});

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

  it("runs an extension only while the plugin it extends runs", () => {
    const assistant = createAssistant({ assistant: { view: null } });
    const extension = createExtension({ assistant: {} });
    const statusesOf = (
      plugins: Parameters<typeof resolvePluginStatuses>[0],
      disabled: readonly string[] = [],
      failed: ReadonlySet<string> = new Set(),
    ) =>
      resolvePluginStatuses(plugins, disabled, failed).map(
        ({ plugin, status }) => [plugin.manifest.id, status],
      );

    expect(statusesOf([extension, assistant])).toEqual([
      ["test.extension", "on"],
      ["test.assistant", "on"],
    ]);
    expect(statusesOf([extension])).toEqual([
      ["test.extension", "needs-parent"],
    ]);
    expect(statusesOf([extension, assistant], ["test.assistant"])).toEqual([
      ["test.extension", "needs-parent"],
      ["test.assistant", "off"],
    ]);
    expect(
      statusesOf([extension, assistant], [], new Set([assistant.hostKey])),
    ).toEqual([
      ["test.extension", "needs-parent"],
      ["test.assistant", "failed"],
    ]);
    expect(statusesOf([extension], ["test.extension"])).toEqual([
      ["test.extension", "off"],
    ]);
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

describe("resolveActiveAssistantId", () => {
  const assistant = createAssistant({ assistant: { view: null } });
  const other = createOther({ assistant: { view: null } });
  const extension = createExtension({ assistant: {} });

  it("defaults to the first running assistant and keeps a choice while its plugin runs", () => {
    const statuses = resolvePluginStatuses(
      [extension, assistant, other],
      [],
      new Set(),
    );

    expect(resolveActiveAssistantId(statuses, null)).toBe("test.assistant");
    expect(resolveActiveAssistantId(statuses, "test.other")).toBe("test.other");
    expect(resolveActiveAssistantId(statuses, "test.extension")).toBe(
      "test.assistant",
    );
  });

  it("falls back while the chosen plugin is off, and has none without assistants", () => {
    const statuses = resolvePluginStatuses(
      [assistant, other],
      ["test.other"],
      new Set(),
    );

    expect(resolveActiveAssistantId(statuses, "test.other")).toBe(
      "test.assistant",
    );
    expect(resolveActiveAssistantId([], "test.other")).toBeUndefined();
  });

  it("marks the shown assistant and its extensions active", () => {
    expect(isAssistantActiveFor(assistant.manifest, "test.assistant")).toBe(
      true,
    );
    expect(isAssistantActiveFor(extension.manifest, "test.assistant")).toBe(
      true,
    );
    expect(isAssistantActiveFor(extension.manifest, "test.other")).toBe(false);
    expect(isAssistantActiveFor(other.manifest, undefined)).toBe(false);
  });
});
