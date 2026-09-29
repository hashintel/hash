// Prepares the inputs for a blind fidelity audit of one run: every net element
// that asserts something about the operation (parameter values, token types,
// places, transitions and their code, differential equations, scenarios and
// metrics), the construction Notes, the person's utterances by turn, and
// Brunch's replies by turn. Nothing names the run's arm.
// Usage: node fidelity-audit-prep.mjs <run-dir> <output-dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [run, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const net = JSON.parse(
  readFileSync(join(run, "evidence", "net.json"), "utf8"),
).sdcpn;
const commits = JSON.parse(
  readFileSync(join(run, "evidence", "ledger.json"), "utf8"),
);
const snapshot = JSON.parse(
  readFileSync(join(run, "evidence", "snapshot.json"), "utf8"),
);

const typeName = (id) => net.types?.find((type) => type.id === id)?.name;
const elements = {
  parameters: (net.parameters ?? []).map((parameter) => ({
    name: parameter.name,
    variableName: parameter.variableName,
    value: parameter.defaultValue,
    description: parameter.description ?? "",
  })),
  types: (net.types ?? []).map((type) => ({
    name: type.name,
    elements: (type.elements ?? []).map(
      (element) => `${element.name}:${element.type}`,
    ),
  })),
  places: (net.places ?? []).map((place) => ({
    name: place.name,
    type: place.colorId ? typeName(place.colorId) : null,
    description: place.description ?? "",
    dynamics: place.dynamicsEnabled ? true : undefined,
  })),
  transitions: (net.transitions ?? []).map((transition) => ({
    name: transition.name,
    description: transition.description ?? "",
    lambdaType: transition.lambdaType,
    inputs: (transition.inputArcs ?? []).map(
      (arc) =>
        `${net.places.find((place) => place.id === arc.placeId)?.name}×${arc.weight}${arc.type && arc.type !== "standard" ? ` (${arc.type})` : ""}`,
    ),
    outputs: (transition.outputArcs ?? []).map(
      (arc) =>
        `${net.places.find((place) => place.id === arc.placeId)?.name}×${arc.weight}`,
    ),
    lambdaCode: transition.lambdaCode ?? "",
    kernelCode: transition.transitionKernelCode ?? "",
  })),
  differentialEquations: (net.differentialEquations ?? []).map((equation) => ({
    name: equation.name,
    type: typeName(equation.colorId),
    code: equation.code,
  })),
  scenarios: (net.scenarios ?? []).map((scenario) => ({
    name: scenario.name,
    description: scenario.description ?? "",
    parameters: scenario.parameters ?? scenario.scenarioParameters ?? [],
    initialState: scenario.initialState ?? scenario.initialMarking ?? null,
    parameterOverrides: scenario.parameterOverrides ?? null,
  })),
  metrics: (net.metrics ?? []).map((metric) => ({
    name: metric.name,
    code: metric.code,
  })),
};
writeFileSync(
  join(out, "net-elements.json"),
  JSON.stringify(elements, null, 2),
);

const turnOf = {};
let turn = 0;
const utterances = [];
const replies = [];
for (const message of snapshot.messages) {
  if (message.role === "user" && message.purpose === "user") {
    turn += 1;
    turnOf[message.id] = turn;
    utterances.push(
      `## Turn ${turn}\n\n${message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")}`,
    );
  } else if (message.role === "assistant" && turn > 0) {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    if (text) replies.push(`## Turn ${turn}\n\n${text}`);
  }
}
writeFileSync(join(out, "person-utterances.md"), utterances.join("\n\n"));
writeFileSync(join(out, "brunch-replies.md"), replies.join("\n\n"));

const notes = commits.flatMap((commit) =>
  commit.notes
    .filter((note) => note.category === "construction")
    .map(
      (note) =>
        `### ${note.id} (turn ${turnOf[commit.afterMessageId]}${note.standing ? `, ${note.standing}` : ""}${note.disposition ? `, ${note.disposition}` : ""}${note.supersedes ? `, supersedes ${note.supersedes}` : ""})\n\n${note.content}`,
    ),
);
writeFileSync(join(out, "construction-notes.md"), notes.join("\n\n"));
console.log(
  `${out}: ${elements.parameters.length} parameters, ${elements.types.length} types, ${elements.places.length} places, ${elements.transitions.length} transitions, ${elements.differentialEquations.length} equations, ${elements.scenarios.length} scenarios, ${elements.metrics.length} metrics; ${notes.length} construction Notes; ${utterances.length} utterances`,
);
