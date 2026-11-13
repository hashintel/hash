/**
 * One process of the process-kill probe: runs the scenario over the storage it
 * is given, parks at its kill point, reports `@@{"event":"parked",…}` and waits
 * there until the test SIGKILLs it.
 *
 * Usage (spawned by `../process-kill.test.ts`, never run by hand):
 * `node --import tsx child.ts <kill point> <storage spec JSON>`.
 */
import {
  gate,
  openFoldHarness,
} from "../../../platform/fold-boundaries/support";
import {
  compactInput,
  compactionPolicy,
  context,
  historyInput,
  historyScript,
  type KillPoint,
  model,
  openStorage,
  type Parked,
  type StorageSpec,
} from "./scenario";

const [point, specText] = process.argv.slice(2) as [KillPoint, string];
const spec = JSON.parse(specText) as StorageSpec;

const reached = gate();
/** Signal the test, then never return: the process is killed here. */
const park = async () => {
  reached.open();
  await new Promise<never>(() => undefined);
};

let decisions = 0;
const faux = model();
const compaction = compactionPolicy(false);
const probe = await openFoldHarness(await openStorage(spec), faux, {
  compaction,
  hook:
    point === "terminal"
      ? {
          // The second round (c1's) is the one with a read-back to prune.
          beforeDecide: async () => {
            decisions += 1;
            if (decisions === 2) await park();
          },
        }
      : point === "admitted"
        ? { afterWrite: park }
        : {},
  section: point === "head" ? { beforePrefix: park } : {},
});
if (point === "summarizing")
  faux.control.summarize = async () => {
    await park();
    throw new Error("Unreachable.");
  };

const root = await probe.harness.root(context, {
  agent: { model: faux.model },
});
faux.script(...historyScript());
let input: number;
if (point === "terminal" || point === "admitted") {
  input = (await root.submit({ type: "input", content: historyInput }, context))
    .id;
} else {
  const history = await root.submit(
    { type: "input", content: historyInput },
    context,
  );
  const settled = await history.wait(context);
  if (settled.status !== "done")
    throw new Error(`History ended ${settled.status}.`);
  compaction.enabled = true;
  input = (await root.submit({ type: "input", content: compactInput }, context))
    .id;
}
await reached.opened;
const parked: Parked = {
  input,
  submissions: [...probe.submissions],
  requests: faux.requests.length,
  summaries: faux.summaries.length,
};
process.stdout.write(
  `@@${JSON.stringify({ event: "parked", data: parked })}\n`,
);
// Keep the event loop alive until the kill.
setInterval(() => undefined, 60_000);
