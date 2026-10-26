import { describe, expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { brunchTools } from "../constants";
import {
  browserExecutedToolInputSchemas,
  browserExecutedToolNames,
  browserNetToolNames,
} from "./browser-executed-tools";
import { netReaderToolNames } from "./net-readers";

describe("browser-executed tools", () => {
  test("are the canonical tools, the net readers, the draft and HASH's entity read", () => {
    expect([...browserExecutedToolNames].sort()).toEqual(
      [
        ...Object.keys(petrinautAiTools),
        ...Object.values(netReaderToolNames),
        brunchTools.draftPetrinautExperiment,
        brunchTools.queryHashEntities,
      ].sort(),
    );
  });

  test("the net tools leave out only the draft and HASH's entity read", () => {
    expect([...browserNetToolNames]).toEqual(
      [...browserExecutedToolNames].filter(
        (name) =>
          name !== brunchTools.draftPetrinautExperiment &&
          name !== brunchTools.queryHashEntities,
      ),
    );
    expect(browserNetToolNames.has("toString")).toBe(false);
  });

  test("compare HASH's entity read input as the server issued it", () => {
    const issued = { entityTypes: ["Supplier"], traversalDepth: 2 };
    expect(
      browserExecutedToolInputSchemas[brunchTools.queryHashEntities]?.parse(
        issued,
      ),
    ).toBe(issued);
  });

  test("parse a net reader's input strictly", () => {
    const schema = browserExecutedToolInputSchemas[netReaderToolNames.outline];
    expect(schema?.parse({})).toEqual({});
    expect(() => schema?.parse({ extra: true })).toThrow(/Invalid key/u);
  });
});
