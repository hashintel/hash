import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadSdcpnModel } from "./load-model";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("loadSdcpnModel", () => {
  it("rejects unsupported versioned files instead of loading them as raw snapshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petrinaut-cli-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "future.json");
    await writeFile(
      path,
      JSON.stringify({ version: 999, places: [], transitions: [] }),
    );

    await expect(loadSdcpnModel(path)).rejects.toThrow(
      "Unsupported SDCPN file format version",
    );
  });

  const minimalModel = {
    title: "Minimal net",
    places: [
      {
        id: "p1",
        name: "Place 1",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 10,
        y: 20,
      },
    ],
    transitions: [
      {
        id: "t1",
        name: "Transition 1",
        inputArcs: [{ placeId: "p1", weight: 1 }],
        outputArcs: [],
        lambdaCode: "true",
      },
    ],
  };

  it("loads a JSON model file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petrinaut-cli-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "model.json");
    await writeFile(path, JSON.stringify(minimalModel));

    const sdcpn = await loadSdcpnModel(path);
    expect(sdcpn.places[0]?.id).toBe("p1");
    expect(sdcpn.transitions[0]?.lambdaCode).toBe("true");
  });

  it("loads a YAML model file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petrinaut-cli-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "model.yaml");
    await writeFile(
      path,
      [
        "title: Minimal net",
        "places:",
        "  - id: p1",
        "    name: Place 1",
        "    colorId: null",
        "    dynamicsEnabled: false",
        "    differentialEquationId: null",
        "    x: 10",
        "    y: 20",
        "transitions:",
        "  - id: t1",
        "    name: Transition 1",
        "    inputArcs:",
        "      - placeId: p1",
        "        weight: 1",
        "    outputArcs: []",
        "    lambdaCode: |-",
        "      true",
        "",
      ].join("\n"),
    );

    const sdcpn = await loadSdcpnModel(path);
    expect(sdcpn.places[0]?.id).toBe("p1");
    expect(sdcpn.transitions[0]?.lambdaCode).toBe("true");
  });
});
