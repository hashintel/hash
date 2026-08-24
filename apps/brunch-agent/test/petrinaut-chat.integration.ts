import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
} from "@earendil-works/pi-ai";
import { start } from "@flue/runtime/node";

import {
  GHERKIN_MODEL_ID,
  GherkinElicitor,
} from "../src/agents/gherkin-elicitor.ts";

const targetDirectory = await mkdtemp(join(tmpdir(), "brunch-petrinaut-chat-"));
process.env.BRUNCH_DEV_TARGET_DOCUMENT_DIR = targetDirectory;
process.env.BRUNCH_TRANSPORT_AISDK_INSPECT = "1";

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: GHERKIN_MODEL_ID, reasoning: true }],
});
faux.setResponses([
  fauxAssistantMessage([
    fauxThinking(
      "I should establish the process outcome before proposing structure.",
    ),
    fauxText("What outcome should this process reliably produce?"),
  ]),
  fauxAssistantMessage([
    fauxThinking("The settlement check does not add user evidence."),
    fauxText(
      "We can start with the outcome and then work backward through the process.",
    ),
  ]),
]);

const flue = await start({
  agents: [GherkinElicitor],
  providers: [faux.provider],
});

try {
  const { default: app } = await import("../src/app.ts");
  const fixturePath = fileURLToPath(
    new URL(
      "../../../libs/@hashintel/brunch-agent/packages/transport-aisdk/test/fixtures/panel-initial.post.json",
      import.meta.url,
    ),
  );
  const response = await app.fetch(
    new Request("http://brunch.test/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "request-fe1436-application",
      },
      body: await readFile(fixturePath, "utf8"),
    }),
  );
  const body = await response.text();
  const chunks = body
    .trim()
    .split("\n\n")
    .slice(0, -1)
    .map(
      (frame) =>
        JSON.parse(frame.slice("data: ".length)) as Record<string, unknown>,
    );
  const startChunk = chunks.find((chunk) => chunk.type === "start");
  const partIds = chunks
    .filter(
      (chunk) =>
        chunk.type === "reasoning-start" || chunk.type === "text-start",
    )
    .map((chunk) => chunk.id);

  process.stdout.write(
    `PETRINAUT_CHAT_RESULT ${JSON.stringify({
      status: response.status,
      messageId: startChunk?.messageId,
      partIds,
      reasoning: chunks
        .filter((chunk) => chunk.type === "reasoning-delta")
        .map((chunk) => chunk.delta)
        .join(""),
      text: chunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
      finish: chunks.at(-1),
      chunks,
    })}\n`,
  );
} finally {
  await flue.stop();
  await rm(targetDirectory, { recursive: true, force: true });
}
