import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { sqlite, start } from "@flue/runtime/node";
import { createFlueClient } from "@flue/sdk";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import {
  ACTIVATE_SKILL_TOOL_NAME,
  CHAT_MODEL_ID,
  ChatAgent,
  RUNBOOK_SKILL_NAME,
} from "../src/agents/chat-agent.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation-identity.ts";
import { CHAT_AGENT_ROUTE } from "../src/routes.ts";
import {
  interviewerToolNamesFrom,
  recoverPnJson,
  recoverRunbookIr,
  skillResourcePathsFrom,
} from "../src/runbook-artifacts.ts";
import {
  READ_SKILL_RESOURCE_TOOL_NAME,
  RUNBOOK_RESOURCE_FILES,
} from "../src/skills/sdcpn-modelling.ts";

const packagedSkillResourcePathFrom = (
  context: unknown,
  fileName: string,
): string => {
  const serialized = JSON.stringify(context);
  const match = serialized.match(
    new RegExp(
      `/\\.flue/packaged-skills/[^"\\s\\\\]+/${fileName.replace(".", "\\.")}`,
    ),
  );
  if (match === null) {
    throw new Error(`activate_skill briefing did not advertise ${fileName}`);
  }
  return match[0];
};

const minimalPn = {
  title: "Partial coatings schedule",
  places: [
    {
      id: "p_orders",
      name: "Orders waiting",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
    {
      id: "p_running",
      name: "Run in progress",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
  ],
  transitions: [
    {
      id: "t_start",
      name: "Start run",
      inputArcs: [{ placeId: "p_orders", weight: 1 }],
      outputArcs: [{ placeId: "p_running", weight: 1 }],
      lambdaType: "predicate" as const,
      lambdaCode: "true",
      transitionKernelCode: "",
    },
  ],
};

const filledIr = [
  "# Runbook IR",
  "## Purpose and outcome",
  "### What the model must answer",
  "Whether holding a line idle to wait for a same-family order beats paying a washdown.",
  "## Posture",
  "### Appetite, time, and accuracy",
  "Cooperative; time-bounded.",
  "## Goals, constraints, measures, and thresholds",
  "On-time demand book; fewer changeover hours.",
  "## Process boundary, triggers, and prerequisites",
  "Weekly demand book arrives; huddle reallocates.",
  "## Participants, locations, and resources",
  "Three filling lines; one changeover crew.",
  "## Activities, inputs, outputs, and resource usage",
  "mix → mill → tint → fill. Crew reserved during washdown.",
  "## Flow, branching, retries, failures, and recovery",
  "Family switch forces washdown. Line 2 filler jams.",
  "## Time, quantities, and stochastic behavior",
  "Tint→white washdown ~3 hours. Exact scrap unknown.",
  "## Policies, exceptions, and practiced rules",
  "Meridian whites prefer the fast line. Unknown: numeric late-order weights.",
  "## Validation criteria",
  "Replay a week against late orders and washdown hours.",
  "## Unknowns, assumptions, conflicts, and omissions",
  "- Unknown: failure/repair distributions.",
  "- Assumed: crew of two is exclusive while washing.",
  "## Projection losses",
  "Political late-order weights cannot sit on the net.",
].join("\n");

const principalKey = "principal-runbook-headless";
const conversationId = "conversation-runbook-headless";
const identity = { principalKey, conversationId };
const instanceId = flueConversationIdFrom(identity);
const dbDirectory = await mkdtemp(join(tmpdir(), "brunch-runbook-"));
const dbFile = join(dbDirectory, "conversations.db");

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: CHAT_MODEL_ID, reasoning: true }],
});

faux.setResponses([
  fauxAssistantMessage(
    [
      fauxToolCall(
        ACTIVATE_SKILL_TOOL_NAME,
        { name: RUNBOOK_SKILL_NAME },
        { id: "tool-skill-1" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  (context) =>
    fauxAssistantMessage(
      [
        fauxToolCall(
          READ_SKILL_RESOURCE_TOOL_NAME,
          { path: packagedSkillResourcePathFrom(context, "elicitation.md") },
          { id: "tool-elicit-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  (context) =>
    fauxAssistantMessage(
      [
        fauxToolCall(
          READ_SKILL_RESOURCE_TOOL_NAME,
          { path: packagedSkillResourcePathFrom(context, "ir-template.md") },
          { id: "tool-ir-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  fauxAssistantMessage([
    fauxText(
      [
        "Walk me through the last time you had to reshuffle the sheet.",
        "```runbook-ir",
        filledIr,
        "```",
      ].join("\n"),
    ),
  ]),
  (context) =>
    fauxAssistantMessage(
      [
        fauxToolCall(
          READ_SKILL_RESOURCE_TOOL_NAME,
          {
            path: packagedSkillResourcePathFrom(context, "pn-construction.md"),
          },
          { id: "tool-pn-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  (context) =>
    fauxAssistantMessage(
      [
        fauxToolCall(
          READ_SKILL_RESOURCE_TOOL_NAME,
          { path: packagedSkillResourcePathFrom(context, "checks.md") },
          { id: "tool-checks-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  fauxAssistantMessage([
    fauxText(
      [
        "Constructed from the IR. Inference: start-run consumes an order token.",
        "Omission: no failure rates.",
        "```runbook-ir",
        filledIr,
        "```",
        "```pn-json",
        JSON.stringify(minimalPn),
        "```",
      ].join("\n"),
    ),
  ]),
]);

const flue = await start({
  agents: [ChatAgent],
  providers: [faux.provider],
  db: sqlite(dbFile),
});

try {
  const { default: app } = await import("../src/app.ts");
  const appTransport: typeof fetch = async (input, init) =>
    app.fetch(input instanceof Request ? input : new Request(input, init));
  const client = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
    fetch: appTransport,
    headers: agentOwnershipHeaders(identity),
  });

  const first = await client.send({
    message: {
      kind: "user",
      body: "Interview me and then produce a Petri-net model I can load.",
    },
  });
  await client.wait(first);

  const mid = await client.history();
  if (recoverRunbookIr(mid) === undefined) {
    throw new Error("IR missing after elicitation turn");
  }

  const second = await client.send({
    message: {
      kind: "user",
      body: "Please construct the Petri-net JSON from the current runbook IR.",
    },
  });
  await client.wait(second);

  const snapshot = await client.history();
  const ir = recoverRunbookIr(snapshot);
  const pn = recoverPnJson(snapshot);
  if (pn === undefined) throw new Error("pn-json missing");
  const parsed = parseSDCPNFile(pn);
  const toolNames = interviewerToolNamesFrom(snapshot);
  const resourcePaths = skillResourcePathsFrom(snapshot);

  process.stdout.write(
    `RUNBOOK_HEADLESS_HERMETIC ${JSON.stringify({
      hasIr: ir !== undefined,
      irHasUnknowns: ir?.includes("Unknown") ?? false,
      parseOk: parsed.ok,
      hadMissingPositions: parsed.ok ? parsed.hadMissingPositions : false,
      toolNames,
      resourceFilesRead: RUNBOOK_RESOURCE_FILES.filter((fileName) =>
        resourcePaths.some((path) => path.endsWith(fileName)),
      ),
      wroteCaptureStore: false,
    })}\n`,
  );
} finally {
  await flue.stop();
}
