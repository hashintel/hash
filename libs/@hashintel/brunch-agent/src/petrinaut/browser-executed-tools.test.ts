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
  test("are the canonical tools, the net readers and the draft", () => {
    expect([...browserExecutedToolNames].sort()).toEqual(
      [
        ...Object.keys(petrinautAiTools),
        ...Object.values(netReaderToolNames),
        brunchTools.draftPetrinautExperiment,
      ].sort(),
    );
  });

  test("the net tools leave out only the draft", () => {
    expect([...browserNetToolNames]).toEqual(
      [...browserExecutedToolNames].filter(
        (name) => name !== brunchTools.draftPetrinautExperiment,
      ),
    );
    expect(browserNetToolNames.has("toString")).toBe(false);
  });

  test("parse a net reader's input strictly", () => {
    const schema = browserExecutedToolInputSchemas[netReaderToolNames.outline];
    expect(schema?.parse({})).toEqual({});
    expect(() => schema?.parse({ extra: true })).toThrow(/Invalid key/u);
  });
});
