import { expect, test, vi } from "vitest";

import {
  createVoiceMediationHandler,
  voiceMediationInstructions,
} from "./voice-mediation";

const environment = {
  OPENAI_VOICE_API_KEY: "server-only",
  PETRINAUT_OPENAI_VOICE_ENABLED: "true",
  PETRINAUT_VOICE_PROVIDER: "live",
};
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://petrinaut.test/api/voice/mediation", {
    method: "POST",
    headers: {
      origin: "https://petrinaut.test",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

test("rejects foreign origins, oversized bodies and disabled Voice before inference", async () => {
  const generate = vi.fn();
  const handle = createVoiceMediationHandler({ environment, generate });
  expect(
    (
      await handle(
        request(
          { kind: "brief", text: "desk" },
          { origin: "https://elsewhere.test" },
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (await handle(request({ kind: "brief", text: "x".repeat(65_536) }))).status,
  ).toBe(413);
  expect((await handle(request({ kind: "brief", text: "" }))).status).toBe(400);
  expect(
    (
      await createVoiceMediationHandler({ environment: {}, generate })(
        request({ kind: "brief", text: "desk" }),
      )
    ).status,
  ).toBe(404);
  expect(generate).not.toHaveBeenCalled();
});

test("validates model evidence before returning the brief and never returns provider errors", async () => {
  const generate = vi.fn().mockResolvedValue({
    kind: "modelling",
    goal: "desk",
    arrivals: "10 per hour",
    handling: null,
    queue: null,
  });
  const handle = createVoiceMediationHandler({ environment, generate });
  const response = await handle(
    request({ kind: "brief", text: "A support desk" }),
  );
  expect(await response.json()).toEqual({
    fields: {
      goal: "desk",
      arrivals: "Still open",
      handling: "Still open",
      queue: "Still open",
      stillOpen: "arrivals, handling, queue",
    },
  });
  expect(response.headers.get("cache-control")).toBe("no-store");
  generate.mockRejectedValueOnce(new Error("secret provider detail"));
  const failure = await handle(request({ kind: "brief", text: "desk" }));
  expect(failure.status).toBe(502);
  expect(await failure.text()).not.toContain("secret");
});

test("wrap-up instructions use a direct conversational voice without weakening factual limits", () => {
  const instructions = voiceMediationInstructions["wrap-up"];
  expect(instructions).toContain(
    "Keep internal names and handoffs out of speech",
  );
  expect(instructions).toContain("Ask a supplied clarification directly");
  expect(instructions).toContain("not scripted lines to repeat");
  expect(instructions).toContain("one or two short spoken sentences");
  expect(instructions).toContain("A draft is not a completed run");
  expect(instructions).toContain(
    "Never invent results, actions or follow-up questions",
  );
});

test("rejects over-budget wrap-ups without silently truncating a claim", async () => {
  const generate = vi.fn().mockResolvedValue({ text: "One. Two. Three." });
  const response = await createVoiceMediationHandler({ environment, generate })(
    request({ kind: "wrap-up", text: "The draft is ready but has not run." }),
  );
  expect(response.status).toBe(502);
});
