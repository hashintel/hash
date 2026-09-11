import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import type { WorkedModelFixture } from "../../worked-model-store.ts";
import type { FlueConversationSnapshot } from "@flue/sdk";

const bundleKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const fixtureVersionPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;

const parseSnapshot = (value: unknown): FlueConversationSnapshot => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("v" in value) ||
    value.v !== 1 ||
    !("conversationId" in value) ||
    typeof value.conversationId !== "string" ||
    !("messages" in value) ||
    !Array.isArray(value.messages) ||
    !("settlements" in value) ||
    !Array.isArray(value.settlements)
  )
    throw new Error("Persona snapshot is not a Flue conversation snapshot.");
  return value as FlueConversationSnapshot;
};

const parseDocument = (value: unknown) => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("sdcpn" in value) ||
    !("revisionId" in value) ||
    typeof value.revisionId !== "string" ||
    value.revisionId.length === 0
  )
    throw new Error(
      "Persona net artifact has no revision-identified SDCPN document.",
    );
  const parsed = parseSDCPNFile({
    ...(value.sdcpn as object),
    title: "Worked-model fixture",
  });
  if (!parsed.ok) throw new Error(parsed.error);
  const { title: _title, ...definition } = parsed.sdcpn;
  return { definition, revisionId: value.revisionId };
};

const atomicWrite = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
};

export const createWorkedModelFixture = async (input: {
  readonly bundleKey: string;
  readonly evidenceDirectory: string;
  readonly fixtureVersion: string;
  readonly outputPath: string;
  readonly title: string;
}): Promise<WorkedModelFixture> => {
  if (!bundleKeyPattern.test(input.bundleKey))
    throw new Error("Bundle key must be lowercase kebab-case.");
  if (!fixtureVersionPattern.test(input.fixtureVersion))
    throw new Error(
      "Fixture version must contain lowercase letters, numbers, dots or hyphens.",
    );
  if (input.title.trim().length === 0)
    throw new Error("Fixture title must not be blank.");
  const [snapshotBytes, workpiece, netBytes, manifestBytes] = await Promise.all(
    [
      readFile(join(input.evidenceDirectory, "snapshot.json")),
      readFile(join(input.evidenceDirectory, "workpiece.md"), "utf8"),
      readFile(join(input.evidenceDirectory, "net.json")),
      readFile(join(input.evidenceDirectory, "manifest.json")),
    ],
  );
  if (workpiece.trim().length === 0)
    throw new Error("Persona workpiece must not be blank.");
  const document = parseDocument(JSON.parse(netBytes.toString("utf8")));
  const fixture: WorkedModelFixture = {
    bundleKey: input.bundleKey,
    fixtureVersion: input.fixtureVersion,
    sourceManifestSha256: createHash("sha256")
      .update(manifestBytes)
      .digest("hex"),
    title: input.title.trim(),
    session: parseSnapshot(JSON.parse(snapshotBytes.toString("utf8"))),
    workpiece,
    definition: document.definition,
    revisionId: document.revisionId,
  };
  await atomicWrite(input.outputPath, `${JSON.stringify(fixture, null, 2)}\n`);
  return fixture;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  const { values } = parseArgs({
    options: {
      bundle: { type: "string" },
      evidence: { type: "string" },
      output: { type: "string" },
      title: { type: "string" },
      version: { type: "string" },
    },
  });
  const required = <T>(value: T | undefined, name: string): T => {
    if (value === undefined) throw new Error(`Supply --${name}.`);
    return value;
  };
  const fixture = await createWorkedModelFixture({
    bundleKey: required(values.bundle, "bundle"),
    evidenceDirectory: resolve(required(values.evidence, "evidence")),
    fixtureVersion: required(values.version, "version"),
    outputPath: resolve(required(values.output, "output")),
    title: required(values.title, "title"),
  });
  process.stdout.write(
    `WORKED_MODEL_FIXTURE ${JSON.stringify({
      bundleKey: fixture.bundleKey,
      fixtureVersion: fixture.fixtureVersion,
      output: resolve(required(values.output, "output")),
      sourceManifestSha256: fixture.sourceManifestSha256,
    })}\n`,
  );
}
