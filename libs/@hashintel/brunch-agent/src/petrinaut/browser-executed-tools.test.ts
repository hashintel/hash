import { describe, expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { brunchTools, hashGraphReadToolNames } from "../constants";
import {
  browserExecutedToolInputSchemas,
  browserExecutedToolNames,
  browserNetToolNames,
} from "./browser-executed-tools";
import { netReaderToolNames } from "./net-readers";

describe("browser-executed tools", () => {
  test("HASH's graph reads are its entity, entity type and web reads", () => {
    expect([...hashGraphReadToolNames]).toEqual([
      brunchTools.queryHashEntities,
      brunchTools.queryHashEntityTypes,
      brunchTools.queryHashWebs,
    ]);
  });

  test("are the canonical tools, the net readers, the draft and HASH's graph reads", () => {
    expect([...browserExecutedToolNames].sort()).toEqual(
      [
        ...Object.keys(petrinautAiTools),
        ...Object.values(netReaderToolNames),
        brunchTools.draftPetrinautExperiment,
        ...hashGraphReadToolNames,
      ].sort(),
    );
  });

  test("the net tools leave out only the draft and HASH's graph reads", () => {
    expect([...browserNetToolNames]).toEqual(
      [...browserExecutedToolNames].filter(
        (name) =>
          name !== brunchTools.draftPetrinautExperiment &&
          !hashGraphReadToolNames.has(name),
      ),
    );
    for (const name of hashGraphReadToolNames)
      expect(browserNetToolNames.has(name)).toBe(false);
    expect(browserNetToolNames.has("toString")).toBe(false);
  });

  test.each([
    [brunchTools.queryHashEntities, { entityTypes: ["Supplier"] }],
    [brunchTools.queryHashEntityTypes, { webIds: ["alice-web"] }],
    [brunchTools.queryHashWebs, {}],
  ])("compare %s input as the server issued it", (name, issued) => {
    expect(browserExecutedToolInputSchemas[name]?.parse(issued)).toBe(issued);
  });

  test("parse a net reader's input strictly", () => {
    const schema = browserExecutedToolInputSchemas[netReaderToolNames.outline];
    expect(schema?.parse({})).toEqual({});
    expect(() => schema?.parse({ extra: true })).toThrow(/Invalid key/u);
  });
});
