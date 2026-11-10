import { describe, expect, it } from "vitest";

import { unknownKeysNotice } from "./unknown-keys-notice";

describe("unknownKeysNotice", () => {
  it("names one key, with array positions in brackets", () => {
    const notice = unknownKeysNotice([
      ["subnets", 0, "places", 1, "portDirection"],
    ]);

    expect(notice.message).toBe("1 field in this file was not read");
    expect(notice.detail).toBe(
      [
        "This version of Petrinaut does not know it, so the net was loaded without it. Check the spelling, or open the file in a newer version.",
        "subnets[0].places[1].portDirection",
      ].join("\n\n"),
    );
  });

  it("lists several keys in the order import reported them", () => {
    const notice = unknownKeysNotice([
      ["fusions"],
      ["componentInstances", 0, "implementation"],
      ["meta", "exportedBy"],
    ]);

    expect(notice.message).toBe("3 fields in this file were not read");
    expect(notice.detail).toBe(
      [
        "This version of Petrinaut does not know them, so the net was loaded without them. Check the spelling, or open the file in a newer version.",
        "fusions\ncomponentInstances[0].implementation\nmeta.exportedBy",
      ].join("\n\n"),
    );
  });

  it("gives keys that differ only in array positions one line", () => {
    const notice = unknownKeysNotice([
      ["places", 0, "portDirection"],
      ["fusions"],
      ["places", 3, "portDirection"],
      ["subnets", 0, "places", 2, "portDirection"],
      ["places", 7, "portDirection"],
    ]);

    expect(notice.message).toBe("5 fields in this file were not read");
    expect(notice.detail?.split("\n\n")[1]).toBe(
      [
        "places[0].portDirection (and 2 more like it)",
        "fusions",
        "subnets[0].places[2].portDirection",
      ].join("\n"),
    );
  });

  it("stays until it is closed, in the editor that opens the imported net", () => {
    const notice = unknownKeysNotice([["fusions"]]);

    expect(notice.tone).toBe("neutral");
    expect(notice.durationMs).toBe(Infinity);
    expect(notice.outlivesEditor).toBe(true);
  });
});
