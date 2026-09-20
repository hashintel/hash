import { describe, expect, it } from "vitest";

import { groupLabsSettings } from "./group-labs-settings";

import type { PetrinautLabsSetting } from "../../../../../types/petrinaut-labs-setting";

const setting = (key: string, group: string): PetrinautLabsSetting => ({
  key,
  group,
  label: key,
  description: key,
  value: false,
  onChange: () => {},
});

describe("groupLabsSettings", () => {
  it("returns nothing for no settings", () => {
    expect(groupLabsSettings([])).toEqual([]);
  });

  it("keeps each group where its first setting appears", () => {
    expect(
      groupLabsSettings([
        setting("a", "Assistant"),
        setting("b", "Drawing"),
        setting("c", "Assistant"),
      ]).map((grouped) => [
        grouped.group,
        grouped.settings.map((entry) => entry.key),
      ]),
    ).toEqual([
      ["Assistant", ["a", "c"]],
      ["Drawing", ["b"]],
    ]);
  });
});
