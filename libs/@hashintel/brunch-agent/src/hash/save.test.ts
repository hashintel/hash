import { expect, test } from "vitest";

import { parseHashSaveInput } from "./save";

test("a save names the open document and nothing else", () => {
  expect(parseHashSaveInput({ documentId: "web~net" })).toEqual({
    documentId: "web~net",
  });
  expect(() => parseHashSaveInput({ documentId: "" })).toThrow(
    /Invalid length/u,
  );
  expect(() =>
    parseHashSaveInput({ documentId: "web~net", title: "Net" }),
  ).toThrow(/Invalid key/u);
});
