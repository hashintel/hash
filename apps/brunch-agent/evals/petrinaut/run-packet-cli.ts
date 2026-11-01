/**
 * Writes `evidence/packet.json` and `evidence/packet.md` for each given
 * persona run or turn-probe directory. Reads retained files only; spends no
 * model turns.
 *
 *   yarn workspace @apps/brunch-agent packet:run <run-dir> [<run-dir> …]
 */
import { resolve } from "node:path";

import { writeRunPacket } from "./run-packet.ts";

const directories = process.argv
  .slice(2)
  .map((directory) => resolve(directory));
if (directories.length === 0) {
  process.stderr.write("Usage: packet:run <run-dir> [<run-dir> …]\n");
  process.exit(2);
}
const written = await Promise.all(
  directories.map(async (directory) => ({
    directory,
    packet: await writeRunPacket(directory),
  })),
);
for (const { directory, packet } of written) {
  const { summary } = packet;
  process.stdout.write(
    `${packet.label}: ${summary.exchanges} exchanges, median ${Math.round((summary.activePerExchangeMs.median ?? 0) / 1000)} s, ${summary.stepsPerExchange?.toFixed(1) ?? "–"} steps per exchange → ${resolve(directory, "evidence", "packet.md")}\n`,
  );
}
