/**
 * A run's analysable packet: per-exchange turn time split into hidden
 * reasoning, argument streaming, reply text and tool phases, with the tool
 * mix, skill activations, Ledger commit sizes, net growth and cost. Reads a
 * persona run or turn-probe directory and writes `evidence/packet.json` and
 * `evidence/packet.md` into it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildRunPacket,
  type RunPacket,
} from "./run-packet/build-run-packet.ts";
import { readRunDirectory } from "./run-packet/read-run-directory.ts";
import { renderRunPacket } from "./run-packet/render-run-packet.ts";

export type { RunPacket } from "./run-packet/build-run-packet.ts";

export const writeRunPacket = async (directory: string): Promise<RunPacket> => {
  const packet = buildRunPacket(await readRunDirectory(directory));
  const evidence = join(directory, "evidence");
  await mkdir(evidence, { recursive: true });
  await Promise.all([
    writeFile(
      join(evidence, "packet.json"),
      `${JSON.stringify(packet, null, 2)}\n`,
    ),
    writeFile(join(evidence, "packet.md"), renderRunPacket(packet)),
  ]);
  return packet;
};
