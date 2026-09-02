import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { skillResourcePathsFrom } from "../src/evaluations/runbook/artifacts.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { CHAT_AGENT_ROUTE } from "../src/http/routes.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const CHAT_MODEL_ID = "claude-haiku-4-5";
const SKILL_NAME = "sdcpn-modelling";

process.env.BRUNCH_CHAT_MODEL = CHAT_MODEL_ID;
process.env.BRUNCH_DEV_DB_PATH = join(
  tmpdir(),
  `brunch-skill-routing-${crypto.randomUUID()}.db`,
);

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: CHAT_MODEL_ID, reasoning: true }],
});
setProvider(faux.provider);

const packagedResourcePathFrom = (
  context: unknown,
  resourcePath: string,
): string => {
  const escapedPath = resourcePath.replaceAll(".", "\\.");
  const match = JSON.stringify(context).match(
    new RegExp(`/\\.flue/packaged-skills/[^"\\s\\\\]+/${escapedPath}`),
  );
  if (match === null) {
    throw new Error(`skill briefing did not advertise ${resourcePath}`);
  }
  return match[0];
};

const activateSkillResponse = fauxAssistantMessage(
  [
    fauxToolCall(
      "activate_skill",
      { name: SKILL_NAME },
      { id: "activate-skill" },
    ),
  ],
  { stopReason: "toolUse" },
);

const readResourceResponse =
  (resourcePath: string, toolCallId: string) => (context: unknown) =>
    fauxAssistantMessage(
      [
        fauxToolCall(
          "read_skill_resource",
          { path: packagedResourcePathFrom(context, resourcePath) },
          { id: toolCallId },
        ),
      ],
      { stopReason: "toolUse" },
    );

const assistantTextFrom = (snapshot: FlueConversationSnapshot): string =>
  snapshot.messages
    .flatMap((message) => message.parts)
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");

const application = await loadBuiltBrunchApplication();

const runScenario = async (
  scenarioName: string,
  userMessage: string,
  responses: Parameters<typeof faux.setResponses>[0],
) => {
  faux.setResponses(responses);
  const identity = {
    principalKey: "principal-skill-routing",
    conversationId: scenarioName,
  };
  const client = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${flueConversationIdFrom(identity)}`,
    fetch: (input, init) =>
      Promise.resolve(
        application.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
      ),
    headers: agentOwnershipHeaders(identity),
  });
  const admission = await client.send({
    message: { kind: "user", body: userMessage },
  });
  await client.wait(admission);
  const snapshot = await client.history();
  return {
    resources: skillResourcePathsFrom(snapshot),
    text: assistantTextFrom(snapshot),
  };
};

try {
  const resolvableReview = await runScenario(
    "resolvable-review",
    [
      "Review this workpiece and tell me the stated objective.",
      "```runbook-ir",
      "# Process-Model Workpiece",
      "## Purpose and posture",
      "Reduce missed dispatch windows.",
      "```",
    ].join("\n"),
    [
      activateSkillResponse,
      fauxAssistantMessage([
        fauxText("The stated objective is to reduce missed dispatch windows."),
      ]),
    ],
  );

  const humanGapReview = await runScenario(
    "human-gap-review",
    [
      "Review this workpiece and resolve the missing release condition.",
      "```runbook-ir",
      "# Process-Model Workpiece",
      "## Activities, inputs, outputs, and resource use",
      "A crew is reserved, but its release condition is not recorded.",
      "```",
    ].join("\n"),
    [
      activateSkillResponse,
      readResourceResponse(
        "references/universal-elicitation.md",
        "read-universal",
      ),
      readResourceResponse("references/profile.md", "read-profile"),
      fauxAssistantMessage([
        fauxText(
          "What observable event makes the reserved crew available to other work again?",
        ),
      ]),
    ],
  );

  const revision = await runScenario(
    "workpiece-revision",
    [
      "Revise this workpiece: the crew is released only after sign-off.",
      "```runbook-ir",
      "# Process-Model Workpiece",
      "## Activities, inputs, outputs, and resource use",
      "The crew release condition is unknown.",
      "```",
    ].join("\n"),
    [
      activateSkillResponse,
      readResourceResponse(
        "references/universal-elicitation.md",
        "read-universal-revision",
      ),
      readResourceResponse("references/profile.md", "read-profile-revision"),
      readResourceResponse("templates/workpiece.md", "read-workpiece-revision"),
      fauxAssistantMessage([
        fauxText(
          [
            "```runbook-ir",
            "# Process-Model Workpiece",
            "## Activities, inputs, outputs, and resource use",
            "The crew is released only after sign-off.",
            "```",
          ].join("\n"),
        ),
      ]),
    ],
  );

  process.stdout.write(
    `SKILL_ROUTING_RESULT ${JSON.stringify({
      resolvableReview: {
        resources: resolvableReview.resources,
        questionCount: resolvableReview.text.match(/\?/gu)?.length ?? 0,
        text: resolvableReview.text,
      },
      humanGapReview: {
        resources: humanGapReview.resources,
        questionCount: humanGapReview.text.match(/\?/gu)?.length ?? 0,
      },
      revision: {
        resources: revision.resources,
        emittedWorkpiece: revision.text.includes("```runbook-ir"),
      },
    })}\n`,
  );
} finally {
  await application.stop();
}
