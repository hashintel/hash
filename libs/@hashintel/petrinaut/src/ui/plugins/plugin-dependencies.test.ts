import { describe, expect, it } from "vitest";

import { definePetrinautPlugin } from "./define-petrinaut-plugin";
import {
  assertUniquePluginIds,
  groupPluginsByDependencies,
  orderPluginsByDependencies,
  resolvePluginStatuses,
} from "./plugin-dependencies";
import { definePluginToken } from "./plugin-token";

const Service = definePluginToken<string>("test.service");
const Other = definePluginToken<string>("test.other");

const provider = definePetrinautPlugin(
  { id: "test.provider", name: "Provider", provides: { service: Service } },
  () => ({ provides: { service: "ready" } }),
);
const dependent = definePetrinautPlugin(
  { id: "test.dependent", name: "Dependent", requires: { service: Service } },
  () => ({}),
);
const bystander = definePetrinautPlugin(
  { id: "test.bystander", name: "Bystander" },
  () => ({}),
);

const ids = (plugins: ReturnType<typeof orderPluginsByDependencies>) =>
  plugins.map(({ manifest }) => manifest.id);

describe("orderPluginsByDependencies", () => {
  it("puts a provider before its dependents and keeps the host's order otherwise", () => {
    expect(
      ids(orderPluginsByDependencies([dependent, bystander, provider])),
    ).toEqual(["test.provider", "test.dependent", "test.bystander"]);
    expect(
      ids(orderPluginsByDependencies([bystander, provider, dependent])),
    ).toEqual(["test.bystander", "test.provider", "test.dependent"]);
  });

  it("names the plugin whose required service nobody provides", () => {
    expect(() => orderPluginsByDependencies([dependent, bystander])).toThrow(
      /"test.dependent" requires "test.service"/,
    );
  });

  it("lets an optional dependency go unprovided", () => {
    const optional = definePetrinautPlugin(
      {
        id: "test.optional",
        name: "Optional",
        requires: { service: Service.optional() },
      },
      () => ({}),
    );
    expect(ids(orderPluginsByDependencies([optional]))).toEqual([
      "test.optional",
    ]);
  });

  it("refuses two providers of one service", () => {
    const rival = definePetrinautPlugin(
      { id: "test.rival", name: "Rival", provides: { service: Service } },
      () => ({ provides: { service: "also ready" } }),
    );
    expect(() => orderPluginsByDependencies([provider, rival])).toThrow(
      /"test.provider" and "test.rival" both provide "test.service"/,
    );
  });

  it("refuses a cycle, naming its path", () => {
    const first = definePetrinautPlugin(
      {
        id: "test.first",
        name: "First",
        provides: { service: Service },
        requires: { other: Other },
      },
      () => ({ provides: { service: "ready" } }),
    );
    const second = definePetrinautPlugin(
      {
        id: "test.second",
        name: "Second",
        provides: { other: Other },
        requires: { service: Service },
      },
      () => ({ provides: { other: "ready" } }),
    );
    expect(() => orderPluginsByDependencies([first, second])).toThrow(
      /cycle: test.first -> test.second -> test.first/,
    );
  });
});

describe("resolvePluginStatuses", () => {
  const statuses = (disabled: string[]) =>
    resolvePluginStatuses([dependent, bystander, provider], disabled).map(
      ({ plugin, enabled, disabledBy }) => [
        plugin.manifest.id,
        enabled,
        disabledBy,
      ],
    );

  it("runs every plugin the user left on", () => {
    expect(statuses([])).toEqual([
      ["test.provider", true, null],
      ["test.dependent", true, null],
      ["test.bystander", true, null],
    ]);
  });

  it("switches a plugin off with the plugins that require it, naming the switch", () => {
    expect(statuses(["test.provider"])).toEqual([
      ["test.provider", false, "test.provider"],
      ["test.dependent", false, "test.provider"],
      ["test.bystander", true, null],
    ]);
    expect(statuses(["test.dependent"])).toEqual([
      ["test.provider", true, null],
      ["test.dependent", false, "test.dependent"],
      ["test.bystander", true, null],
    ]);
  });

  it("keeps a plugin running when only an optional provider is off", () => {
    const optional = definePetrinautPlugin(
      {
        id: "test.optional",
        name: "Optional",
        requires: { service: Service.optional() },
      },
      () => ({}),
    );
    expect(
      resolvePluginStatuses([optional, provider], ["test.provider"]).map(
        ({ plugin, enabled }) => [plugin.manifest.id, enabled],
      ),
    ).toEqual([
      ["test.provider", false],
      ["test.optional", true],
    ]);
  });
});

describe("assertUniquePluginIds", () => {
  it("refuses a plugin passed twice", () => {
    expect(() => assertUniquePluginIds([bystander, bystander])).toThrow(
      /"test.bystander" is passed twice/,
    );
    expect(() => assertUniquePluginIds([bystander, provider])).not.toThrow();
  });
});

describe("groupPluginsByDependencies", () => {
  it("groups a provider with its dependents, through optional tokens too, and keeps the order", () => {
    const otherProvider = definePetrinautPlugin(
      { id: "test.other-provider", name: "Other", provides: { other: Other } },
      () => ({ provides: { other: "ready" } }),
    );
    const bridge = definePetrinautPlugin(
      {
        id: "test.bridge",
        name: "Bridge",
        requires: { service: Service, other: Other.optional() },
      },
      () => ({}),
    );
    const ordered = orderPluginsByDependencies([
      bystander,
      dependent,
      provider,
      bridge,
      otherProvider,
    ]);

    expect(
      groupPluginsByDependencies(ordered).map((group) =>
        group.map(({ manifest }) => manifest.id),
      ),
    ).toEqual([
      ["test.bystander"],
      ["test.provider", "test.dependent", "test.other-provider", "test.bridge"],
    ]);
  });

  it("leaves a plugin alone whose optional provider is not in the list", () => {
    const optionalDependent = definePetrinautPlugin(
      {
        id: "test.optional-dependent",
        name: "Optional dependent",
        requires: { service: Service.optional() },
      },
      () => ({}),
    );

    expect(
      groupPluginsByDependencies([optionalDependent, bystander]).map((group) =>
        group.map(({ manifest }) => manifest.id),
      ),
    ).toEqual([["test.optional-dependent"], ["test.bystander"]]);
  });
});
