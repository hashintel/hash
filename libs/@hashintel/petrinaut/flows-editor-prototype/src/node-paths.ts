/**
 * How a branching step shows its paths on the canvas card (inbox `node-paths`, 5 Nov), read from the URL only. With
 * no `?nodepaths=` the card shows `rows` (picked by Aakarsh, 10 Nov); every other take stays reachable by URL:
 * `?nodepaths=today|wires|chips|count|pills`. Each take draws the same paths: Ask a person's Approved and
 * Rejected, If's Yes and No, a Switch's cases and Default.
 *
 * - `rows` (default): see below.
 * - `today`: the card as it was before the pick: the same rows, every port a hollow ring, connected or not.
 * - `wires`: the card keeps its two lines; the paths leave its right edge, and each wire carries its path's name.
 *   An open path is its name beside a hollow port.
 * - `rows`: Attio's card (ops `research/attio-paths-2026-11-05`). One row per path inside the card, its name
 *   right-aligned and its own port on the right edge; a hollow ring is open, a filled dot connected. No labels on
 *   the wires.
 * - `chips`: the card keeps its two lines; each path is a small chip on its right edge, with the port at the chip's
 *   end. An open path's chip is dashed.
 * - `count`: the card says "N paths" on one row and every wire leaves one port; hovering or selecting the card opens
 *   the rows of `rows`.
 * - `pills`: the card has one port; each path is a small pill node just after it, and the wires leave the pills.
 *
 * `&run` shows the demo run: read-only, the taken path's port and wire in the DS success tone, the steps and paths
 * the run did not take faint and dashed.
 */
import { addStep, type EditorDocument, START_ID } from "./document";
import { switchTake } from "./switch-flags";

export type NodePathsTake = "wires" | "rows" | "chips" | "count" | "pills";

const takes: NodePathsTake[] = ["wires", "rows", "chips", "count", "pills"];

/** The URL's take: `rows` with no `?nodepaths=`; `today` (and an unknown value) draws the previous card, so it is null. */
const urlValue = new URLSearchParams(globalThis.location.search).get(
  "nodepaths",
);

const query = new URLSearchParams(globalThis.location.search);

export const nodePathsTake: NodePathsTake | null =
  urlValue === null
    ? "rows"
    : (takes.find((take) => take === urlValue) ?? null);

/** `&run` shows the demo run on a take given in the URL, or on the `node-paths` demo state under the default. */
export const nodePathsRun =
  nodePathsTake !== null &&
  query.has("run") &&
  (urlValue !== null || query.get("state") === "node-paths");

/** The demo run's choices, by step description: Approved, then No, then Asia. */
const takenByDescription: Record<string, string> = {
  "QA lead reviews the batch": "approved",
  "Amount over 10,000": "false",
  "Route by supplier region": "asia",
};

/** In the demo run: the path each branching step took, and the steps and wires the run reached. */
export const demoRun = (document: EditorDocument) => {
  const ports = (stepId: string) => {
    const step = document.steps.find(
      (candidate) => candidate.stepId === stepId,
    );
    return step ? takenByDescription[step.description] : undefined;
  };
  const ran = new Set<string>([START_ID]);
  const ranWires = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const wire of document.wires) {
      if (!ran.has(wire.source) || ranWires.has(wire.id)) {
        continue;
      }
      const taken = ports(wire.source);
      if (taken !== undefined && wire.sourcePort !== taken) {
        continue;
      }
      ranWires.add(wire.id);
      if (!ran.has(wire.target)) {
        ran.add(wire.target);
      }
      grew = true;
    }
  }
  return { ran, ranWires, takenPort: ports };
};

const emptyStart = (): EditorDocument => ({
  name: "Batch release",
  inputs: [],
  steps: [],
  positions: { [START_ID]: { x: 0, y: 220 } },
  wires: [],
  templates: {},
  lists: {},
  queries: {},
  patches: {},
  triggers: [],
  startDescription: "",
  inputEntityTypes: {},
});

/**
 * The `node-paths` demo flow: Find entities, Ask a person (Approved / Rejected), an If (Yes / No) and a Switch with
 * four cases and Default. Africa leads nowhere, so one path is open. Each branching step has room after it for
 * labels and pills.
 */
export const nodePathsExample = (): EditorDocument => {
  let document: EditorDocument = { ...emptyStart() };
  const add = (
    catalogId: string,
    after: { stepId: string; port: string },
    description: string,
    position: { x: number; y: number },
  ) => {
    const added = addStep(document, catalogId, { after });
    document = {
      ...added.document,
      steps: added.document.steps.map((step) =>
        step.stepId === added.stepId ? { ...step, description } : step,
      ),
      positions: { ...added.document.positions, [added.stepId]: position },
    };
    return added.stepId;
  };
  const found = add(
    "queryEntities",
    { stepId: START_ID, port: "next" },
    "Failed batch",
    { x: 296, y: 220 },
  );
  const review = add(
    "requestReview",
    { stepId: found, port: "next" },
    "QA lead reviews the batch",
    { x: 592, y: 220 },
  );
  const check = add(
    "if",
    { stepId: review, port: "approved" },
    "Amount over 10,000",
    { x: 992, y: 120 },
  );
  add(
    "sendEmail",
    { stepId: review, port: "rejected" },
    "Alert to the team",
    { x: 992, y: 420 },
  );
  add(
    "sendEmail",
    { stepId: check, port: "true" },
    "Ask finance to sign off",
    { x: 1392, y: 20 },
  );
  const route = add(
    "switch",
    { stepId: check, port: "false" },
    // `?switch=s4`: no Switch; the step here finds the batch's supplier and splits by Region.
    switchTake === "s4" ? "Batch supplier" : "Route by supplier region",
    { x: 1392, y: 240 },
  );
  add("sendEmail", { stepId: route, port: "europe" }, "EU quality desk", {
    x: 1792,
    y: 130,
  });
  add("sendEmail", { stepId: route, port: "americas" }, "Americas desk", {
    x: 1792,
    y: 230,
  });
  add("sendEmail", { stepId: route, port: "asia" }, "Asia quality desk", {
    x: 1792,
    y: 330,
  });
  add("sendEmail", { stepId: route, port: "default" }, "Hold for the QA lead", {
    x: 1792,
    y: 470,
  });
  return { ...document, startDescription: "Flow inputs" };
};
