/**
 * A version load reaching the HASH agent's model, through a real in-process
 * Flue runtime and agent loop with a scripted model: the host's version load
 * rides each user turn's host context, and the model reads a note on the
 * first turn that carries a new one. No provider is called.
 */
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  type Message,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { start } from "@flue/runtime/node";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient } from "@flue/sdk";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import {
  petrinautContextualUserMessageBody,
  petrinautSubmissionContext,
  type VersionLoad,
} from "@hashintel/brunch-agent";

import { versionLoadNote } from "./version-load-note.ts";

// Only the Flue build packages skills; the note doesn't depend on their content.
vi.mock("./skills/eliciting/SKILL.md", () => ({
  default: { name: "eliciting", description: "Eliciting.", instructions: "." },
}));
vi.mock("./skills/modelling/SKILL.md", () => ({
  default: { name: "modelling", description: "Modelling.", instructions: "." },
}));
vi.mock("./skills/petrinaut/SKILL.md", () => ({
  default: { name: "petrinaut", description: "Petrinaut.", instructions: "." },
}));
vi.mock("./skills/hash-graph/SKILL.md", () => ({
  default: {
    name: "hash-graph",
    description: "HASH graph.",
    instructions: ".",
  },
}));

const faux = fauxProvider({ provider: "faux", models: [{ id: "faux-1" }] });
/** The user turns of each model request, as the model read them. */
const requests: string[][] = [];
const userTexts = (context: TranscriptContext): string[] =>
  context.messages.flatMap((message: Message) =>
    message.role !== "user"
      ? []
      : [
          typeof message.content === "string"
            ? message.content
            : message.content
                .flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join(""),
        ],
  );
faux.setResponses(
  Array.from({ length: 20 }, () => (context: TranscriptContext) => {
    requests.push(userTexts(context));
    return fauxAssistantMessage([fauxText("Noted.")]);
  }),
);

let hashAgent: Parameters<typeof createAgentRouter>[0];
let stopRuntime: () => Promise<void> = async () => {};
beforeAll(async () => {
  vi.stubEnv("BRUNCH_CHAT_MODEL", "faux/faux-1");
  vi.stubEnv("BRUNCH_CHAT_THINKING", "");
  const { HashAgent } = await import("./agent.ts");
  hashAgent = HashAgent;
  const flue = await start({ agents: [HashAgent], providers: [faux.provider] });
  stopRuntime = () => flue.stop();
});
afterAll(async () => {
  await stopRuntime();
  vi.unstubAllEnvs();
});

/** A fresh document-bound conversation; each turn is sent as the HASH host sends it. */
const conversation = () => {
  const instanceId = crypto.randomUUID();
  const binding = { conversationId: instanceId, documentId: "web~net" };
  const router = createAgentRouter(hashAgent);
  const client = createFlueClient({
    url: `http://flue.test/${instanceId}`,
    fetch: async (input, init) =>
      router.fetch(input instanceof Request ? input : new Request(input, init)),
  });
  return async (userText: string, versionLoad?: VersionLoad) => {
    const submissionContext = petrinautSubmissionContext({
      words: [],
      ...(versionLoad === undefined ? {} : { versionLoad }),
    });
    const receipt = await client.send({
      initialData: { binding },
      message: {
        kind: "user",
        body:
          submissionContext === undefined
            ? userText
            : petrinautContextualUserMessageBody({
                userText,
                diagnosticsContext: "",
                submissionContext,
              }),
      },
    });
    await client.wait(receipt, { signal: AbortSignal.timeout(10_000) });
    const request = requests.at(-1);
    if (!request) throw new Error("The model was never asked.");
    return request;
  };
};

const earlierVersion = {
  id: "load-1",
  decisionTime: "2026-10-27T10:00:00.000Z",
};
const note = versionLoadNote(earlierVersion);

test("the turn after a version load carries the note with the loaded version's time, and the next turn carries none", async () => {
  const send = conversation();
  expect(await send("Add the reservoir.")).toEqual(["Add the reservoir."]);

  const afterLoad = await send("Carry on.", earlierVersion);
  expect(afterLoad.at(-1)).toBe(`${note}\n\nCarry on.`);
  expect(note).toContain("2026-10-27T10:00:00.000Z");

  // The editor still sends the same load; the note stays where it happened.
  const following = await send("And the overflow?", earlierVersion);
  expect(following).toEqual([
    "Add the reservoir.",
    `${note}\n\nCarry on.`,
    "And the overflow?",
  ]);
});

test("a later load of a version already announced is announced again", async () => {
  const send = conversation();
  await send("Carry on.", earlierVersion);
  await send("Saved it.", earlierVersion);
  const again = await send("Back to that one.", {
    ...earlierVersion,
    id: "load-2",
  });
  expect(again.filter((text) => text.startsWith(note))).toHaveLength(2);
  expect(again.at(-1)).toBe(`${note}\n\nBack to that one.`);
});

test("turns without a version load read exactly as before", async () => {
  const send = conversation();
  await send("Four agents.");
  expect(await send("Two queues.")).toEqual(["Four agents.", "Two queues."]);
});
