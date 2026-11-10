import { describe, expect, it } from "vitest";

import { parseModelFile } from "./parse-model-file";

const model = {
  version: 1,
  title: "Model",
  places: [{ id: "p1", name: "Place1" }],
  transitions: [],
};

describe("parseModelFile", () => {
  it("returns the net without its title", () => {
    const definition = parseModelFile("model", model);

    expect(definition.places).toHaveLength(1);
    expect(definition).not.toHaveProperty("title");
  });

  it("names the model and the reason when the file does not parse", () => {
    expect(() => parseModelFile("model", { ...model, version: 99 })).toThrow(
      "model: Unsupported SDCPN file format version",
    );
  });

  it("names the model and every key the file schema does not define", () => {
    expect(() =>
      parseModelFile("model", {
        ...model,
        places: [{ id: "p1", name: "Place1", portDirection: "in" }],
        fusions: [{ id: "fusion-1" }],
      }),
    ).toThrow(
      "model: the file schema does not define places.0.portDirection, fusions",
    );
  });
});
