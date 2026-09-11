import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { createWorkedModelFixture } from "../src/evaluations/persona/create-worked-model-fixture.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test("packages one reviewed persona session, workpiece and net", async () => {
  const directory = await mkdtemp(join(tmpdir(), "worked-model-fixture-"));
  directories.push(directory);
  const evidence = join(directory, "evidence");
  await mkdir(evidence, { recursive: true });
  const snapshot = {
    v: 1,
    conversationId: "inventory-source",
    offset: "offset-1",
    messages: [],
    settlements: [],
  };
  const workpiece = "# Inventory purchasing\n\nAccepted local account.\n";
  const net = {
    id: "inventory-source-document",
    title: "Inventory purchasing",
    revisionId: "inventory-source-revision",
    sdcpn: {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
  };
  const manifest = {
    algorithm: "sha256",
    files: [
      { path: "net.json", sha256: "a".repeat(64) },
      { path: "snapshot.json", sha256: "b".repeat(64) },
      { path: "workpiece.md", sha256: "c".repeat(64) },
    ],
  };
  await Promise.all([
    writeFile(
      join(evidence, "snapshot.json"),
      JSON.stringify(snapshot),
      "utf8",
    ),
    writeFile(join(evidence, "workpiece.md"), workpiece, "utf8"),
    writeFile(join(evidence, "net.json"), JSON.stringify(net), "utf8"),
    writeFile(
      join(evidence, "manifest.json"),
      JSON.stringify(manifest),
      "utf8",
    ),
  ]);
  const outputPath = join(directory, "inventory-purchasing.json");

  const fixture = await createWorkedModelFixture({
    bundleKey: "inventory-purchasing",
    evidenceDirectory: evidence,
    fixtureVersion: "inventory-purchasing-v1",
    outputPath,
    title: "Inventory purchasing",
  });

  expect(fixture).toMatchObject({
    bundleKey: "inventory-purchasing",
    fixtureVersion: "inventory-purchasing-v1",
    title: "Inventory purchasing",
    session: snapshot,
    workpiece,
    definition: net.sdcpn,
    revisionId: net.revisionId,
  });
  expect(fixture.sourceManifestSha256).toBe(
    createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  );
  expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(fixture);
});

test("refuses invalid identity and incomplete evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "worked-model-fixture-"));
  directories.push(directory);
  await expect(
    createWorkedModelFixture({
      bundleKey: "Inventory_Purchasing",
      evidenceDirectory: directory,
      fixtureVersion: "v1",
      outputPath: join(directory, "fixture.json"),
      title: "Inventory",
    }),
  ).rejects.toThrow(/lowercase kebab-case/u);
  await expect(
    createWorkedModelFixture({
      bundleKey: "inventory-purchasing",
      evidenceDirectory: directory,
      fixtureVersion: "v1",
      outputPath: join(directory, "fixture.json"),
      title: "Inventory",
    }),
  ).rejects.toThrow();
});
