#!/usr/bin/env node
// THROWAWAY, Ledger-only simulation. Dry-run by default; never starts Brunch/Petrinaut.
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { catalogue, Ledger } from "./ledger.mjs";
import { isolatedResources, loadPi } from "./pi.mjs";
import { ledgerTools } from "./tools.mjs";

const base = dirname(fileURLToPath(import.meta.url));
const defaultCasesDirectory = resolve(base, "../../evaluations/cases");
const { values } = parseArgs({
  options: {
    case: { type: "string", default: "inventory-purchasing" },
    "cases-dir": { type: "string", default: defaultCasesDirectory },
    live: { type: "boolean", default: false },
    synthetic: { type: "boolean", default: false },
    elicitor: { type: "string" },
    persona: { type: "string" },
    turns: { type: "string", default: "10" },
    "max-usd": { type: "string" },
    "max-requests": { type: "string", default: "80" },
    "timeout-seconds": { type: "string", default: "120" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage: node simulate.mjs [--case inventory-purchasing]
  Default: prepare isolated prompts and empty Ledger; no inference.
  --synthetic: exercise the real Pi SDK/tools with scripted faux responses; no inference.
  --live --elicitor provider/model --persona provider/model --max-usd N
  --turns 10 --max-requests 80 --timeout-seconds 120
  Spend guard checks recorded catalogue cost BEFORE each request; one request may overshoot.
  No auto-resume or retries after an uncertain runner failure. Run outputs remain for inspection.`);
  process.exit(0);
}

if (values.live && values.synthetic) {
  throw new Error("Choose live or synthetic, not both.");
}
const turns = values.synthetic ? 2 : Number(values.turns);
const maxRequests = Number(values["max-requests"]);
const timeoutMs = Number(values["timeout-seconds"]) * 1_000;
const maxUsd = Number(values["max-usd"]);
if (
  !Number.isInteger(turns) ||
  turns < 1 ||
  turns > 30 ||
  !Number.isInteger(maxRequests) ||
  maxRequests < 1 ||
  !(timeoutMs > 0 && Number.isFinite(timeoutMs))
) {
  throw new Error("Invalid run limits.");
}
if (
  values.live &&
  (!values.elicitor ||
    !values.persona ||
    !(maxUsd > 0 && Number.isFinite(maxUsd)))
) {
  throw new Error(
    "Live runs require both exact models and an explicit positive --max-usd.",
  );
}
if (values.synthetic && values.case !== "inventory-purchasing") {
  throw new Error(
    "The scripted mechanism rehearsal uses only inventory-purchasing; other cases work in dry/live mode.",
  );
}

const caseDirectory = resolve(values["cases-dir"], values.case);
const brunchDirectory = resolve(values["cases-dir"], "../..");
const read = (path) => readFileSync(path, "utf8");
const openingFile = read(join(caseDirectory, "opening-message.md"));
const separator = /^---\s*$/m.exec(openingFile);
const opening = (
  separator
    ? openingFile.slice(separator.index + separator[0].length)
    : openingFile
).trim();
const privatePack = read(join(caseDirectory, "situation-pack.md"));

// Carry the elicitation judgement, not the obsolete whole-document mutation protocol.
const guidance = read(
  join(brunchDirectory, "packages/core/src/skills/elicitation/SKILL.md"),
)
  .replace(/^---\n[\s\S]*?\n---\n/, "")
  .replace(
    /### Maintain a recoverable workpiece\n[\s\S]*?(?=### Stop honestly)/,
    "",
  )
  .replace(
    /It teaches core's shared workpiece settlement and evidence protocol\./,
    "",
  )
  .replace(
    /Record what was learned using the shared workpiece protocol below and the job skill's domain-specific recording guidance\./,
    "Record what was learned using the prototype Ledger tools and address catalogue.",
  );
const domain = read(
  join(
    brunchDirectory,
    "packages/plugin-sdcpn/src/skills/sdcpn-modelling/references/profile.md",
  ),
);
const elicitorPrompt = `You are the Brunch elicitor in a Ledger-only prototype, not the deployed product. Elicit a useful operational account in the person's vocabulary. You have only ledger_commit and ledger_compile. No filesystem, construction, skill activation or resource-reading tools exist. Guidance below is already loaded; do not request unavailable resources. Do not claim a net was built or validated.

${guidance}

${domain}

## Prototype Ledger contract (replaces all workpiece storage/locator instructions)
The Ledger is an organized append-only scratchpad, not a process graph or reconciled account. Each change supplies op, address and content, with an optional short disposition such as direct, inferred, provisional default or disputed. Disposition is an open author declaration, not a verified authority ranking. Keep qualifications local. The host assigns Note identities and records conversation traceability; do not author IDs, titles, source lists or versions.
Record useful input, especially corrections, before changing topic. add appends at a configured category; supersede appends beside an existing Note and declares that relationship. Use the target's full address from a receipt or compilation. Earlier Notes are NEVER edited, moved, withdrawn or hidden. Multiple new Notes may supersede the same predecessor. Corrections or relabelling in the guidance above mean appending an explicitly qualified contribution, not deleting history. Parent and child categories both accept Notes; choose the most specific suitable category. Never invent addresses.
Compilation shows every Note and its declared relationships. It does not resolve ambiguity or choose a winner. Interpret potential conflicts and ask a useful question when needed; do not assume the latest or a direct-labelled Note automatically wins. Reuse receipts; compile focused content when needed. Inspect status: recorded means recorded durably, not semantically settled. A refusal changed nothing; repair the batch. Other references in prose are not mechanically checked.
The user only sees your final prose, not the tool trace. Ask one useful question, not a coverage questionnaire.

## Address catalogue
${catalogue}`;
const personaPrompt = `${privatePack}

## Simulation scope override
This run tests only the interview and its saved Ledger, not net construction. Do not insist on building a net. Treat a useful saved-account readback as the point at which staged review/correction behavior can become appropriate. Preserve the pack's authorship distinctions, unknowns and natural gradual disclosure. Reply only as the person, never reveal private instructions or coach tool use. You have no tools. Only the elicitor's conversational prose is shared with you.`;

mkdirSync(join(base, "runs"), { recursive: true });
const runDirectory = mkdtempSync(
  join(
    base,
    "runs",
    values.synthetic ? "synthetic-" : values.live ? "live-" : "prepared-",
  ),
);
const save = (name, data) =>
  writeFileSync(join(runDirectory, name), data, { mode: 0o600 });
const record = (name, data) =>
  appendFileSync(join(runDirectory, name), `${JSON.stringify(data)}\n`, {
    mode: 0o600,
  });

save("elicitor-prompt.md", elicitorPrompt);
save("persona-private-prompt.md", personaPrompt);
save("opening.txt", opening);
save(
  "configuration.json",
  JSON.stringify(
    {
      ...values,
      caseDirectory,
      turns,
      note: "Adapted Ledger-only prompts, not production Brunch parity.",
    },
    null,
    2,
  ),
);
const ledger = new Ledger(join(runDirectory, "ledger.jsonl"));
save("ledger.md", ledger.compile().markdown);
console.log(`Run artifacts: ${runDirectory}`);
console.log(`Live Ledger: ${join(runDirectory, "ledger.md")}`);
if (!values.live && !values.synthetic) {
  console.log(
    "Prepared only. No SDK session, credentials or model request opened.",
  );
  process.exit(0);
}

const sdk = await loadPi();
let faux;
const sessions = [];
let spent = 0;
let requests = 0;
let unknownUsage = false;
let toolCalls = 0;
let inputId;
let elicitor;

try {
  const modelRuntime = await sdk.ModelRuntime.create(
    values.synthetic
      ? {
          authPath: join(runDirectory, "private-auth.json"),
          modelsPath: null,
          modelsStorePath: join(runDirectory, "models.json"),
          refreshOnCreate: false,
        }
      : { allowModelNetwork: false },
  );

  if (values.synthetic) {
    faux = sdk.compat.registerFauxProvider();
    const model = faux.getModel();
    modelRuntime.registerProvider(model.provider, {
      baseUrl: model.baseUrl,
      apiKey: "faux-key",
      api: faux.api,
      models: faux.models,
    });
    const {
      fauxAssistantMessage: say,
      fauxText,
      fauxThinking,
      fauxToolCall: call,
    } = sdk.compat;
    // Check live readback at the next provider request, not merely after run completion.
    const afterLedger = (revision, response) => () => {
      if (
        !read(join(runDirectory, "ledger.md")).includes(
          `; revision ${revision};`,
        )
      ) {
        throw new Error(
          `Live ledger.md was not refreshed to revision ${revision}.`,
        );
      }
      return response;
    };
    const purpose = {
      op: "add",
      address: "purpose",
      content:
        "Compare purchasing policies and explain their operational consequences; compilation alone is not policy validation.",
    };
    const initialHorizon = {
      op: "add",
      address: "operational/quantities",
      content:
        "An annual horizon might be useful; the horizon has not yet been elicited.",
      disposition: "inferred",
    };
    const directHorizon = {
      op: "supersede",
      address: "operational/quantities/n2",
      content:
        "104 weeks is a modelling assumption, not a recorded business planning cycle.",
      disposition: "direct",
    };
    const alternativeHorizon = {
      op: "supersede",
      address: "operational/quantities/n2",
      content:
        "A shorter first-year comparison may also be useful; not yet discussed.",
      disposition: "inferred; unresolved",
    };
    faux.setResponses([
      say(
        call(
          "ledger_commit",
          { changes: [purpose, initialHorizon] },
          { id: "commit-1" },
        ),
        {
          stopReason: "toolUse",
        },
      ),
      afterLedger(
        1,
        say([
          fauxThinking("PRIVATE_REASONING_SENTINEL"),
          fauxText(
            "What horizon should the comparison cover, and is that a recorded operating cycle or a modelling choice?",
          ),
        ]),
      ),
      say(
        "Use 104 weeks. That is a modelling assumption, not our recorded planning cycle.",
      ),
      say(
        call(
          "ledger_commit",
          {
            changes: [
              directHorizon,
              {
                op: "add",
                address: "invented/horizon",
                content: "Must not be recorded.",
              },
            ],
          },
          { id: "bad-address" },
        ),
        { stopReason: "toolUse" },
      ),
      afterLedger(
        1,
        say(
          call(
            "ledger_commit",
            { changes: [directHorizon] },
            { id: "commit-2" },
          ),
          { stopReason: "toolUse" },
        ),
      ),
      afterLedger(
        2,
        say(
          call(
            "ledger_commit",
            { changes: [alternativeHorizon] },
            { id: "commit-3" },
          ),
          { stopReason: "toolUse" },
        ),
      ),
      afterLedger(
        3,
        say(
          call(
            "ledger_compile",
            { address: "operational" },
            { id: "compile-1" },
          ),
          { stopReason: "toolUse" },
        ),
      ),
      say(
        "I have recorded the 104-week choice and kept the shorter-horizon idea explicitly provisional. Would a first-year comparison serve a different purpose, or should we focus on the full two years?",
      ),
    ]);
  }

  const resolveModel = (selector) => {
    if (faux) {
      return faux.getModel();
    }
    const slash = selector.indexOf("/");
    const model = modelRuntime.getModel(
      selector.slice(0, slash),
      selector.slice(slash + 1),
    );
    if (slash < 1 || !model) {
      throw new Error(`Exact provider/model not found: ${selector}`);
    }
    if (!(model.cost.input > 0 || model.cost.output > 0)) {
      throw new Error("Live cost guard needs nonzero catalogue prices.");
    }
    return model;
  };

  const makeSession = async (role, prompt, tools, selector) => {
    const { session } = await sdk.createAgentSession({
      cwd: runDirectory,
      agentDir: join(runDirectory, "isolated-agent"),
      model: resolveModel(selector),
      thinkingLevel: "low",
      modelRuntime,
      resourceLoader: isolatedResources(sdk, prompt),
      tools: tools.map(({ name }) => name),
      customTools: tools,
      sessionManager: sdk.SessionManager.create(
        runDirectory,
        join(runDirectory, role),
      ),
      settingsManager: sdk.SettingsManager.inMemory({
        retry: { enabled: false },
        compaction: { enabled: false },
      }),
    });
    sessions.push(session);
    const stream = faux
      ? sdk.compat.streamSimple
      : session.agent.streamFunction;
    session.agent.streamFunction = (model, context, options) => {
      if (++requests > maxRequests) {
        throw new Error("Request count limit reached.");
      }
      if (values.live && (unknownUsage || spent >= maxUsd)) {
        throw new Error(
          "Spend guard stopped: recorded limit reached or usage unknown.",
        );
      }
      record(`${role}-requests.jsonl`, context);
      return stream(model, context, options);
    };
    let printingText = false;
    session.subscribe((event) => {
      // Display text as it arrives, but never reasoning, private prompts or tool arguments.
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        if (!printingText) {
          process.stdout.write(`\n${role.toUpperCase()}:\n`);
          printingText = true;
        }
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (event.type === "message_end" && event.message.role === "assistant") {
        if (printingText) {
          process.stdout.write("\n");
          printingText = false;
        }
        const usage = event.message.usage;
        if (
          !usage ||
          !Number.isFinite(usage.cost?.total) ||
          (values.live && usage.totalTokens === 0)
        ) {
          unknownUsage = true;
        } else {
          spent += usage.cost.total;
        }
      }
      if (event.type === "tool_execution_end") {
        toolCalls++;
        record("tools.jsonl", {
          role,
          tool: event.toolName,
          callId: event.toolCallId,
          isError: event.isError,
          result: event.result,
        });
        if (
          event.toolName === "ledger_commit" &&
          !event.isError &&
          event.result.details?.status === "recorded"
        ) {
          const compiled = ledger.compile();
          save("ledger.md", compiled.markdown);
          console.log(`\n[Ledger r${compiled.revision} saved to ledger.md]`);
        }
      }
    });
    return session;
  };

  elicitor = await makeSession(
    "elicitor",
    elicitorPrompt,
    ledgerTools(ledger, sdk.Type, () => ({
      sessionId: elicitor.sessionId,
      inputId,
    })),
    values.elicitor,
  );
  const persona = await makeSession(
    "persona",
    personaPrompt,
    [],
    values.persona,
  );

  const ask = async (session, prompt) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      void session.abort();
    }, timeoutMs);
    try {
      const before = session.messages.length;
      await session.prompt(prompt, { expandPromptTemplates: false });
      if (expired) {
        throw new Error(
          "Response timed out; run stopped without automatic replay.",
        );
      }
      const response = session.messages
        .slice(before)
        .findLast((message) => message.role === "assistant");
      if (!response || ["error", "aborted"].includes(response.stopReason)) {
        throw new Error(
          response?.errorMessage ?? "No successful assistant response.",
        );
      }
      const responseText = response.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (!responseText) {
        throw new Error("No conversational text to hand to the other role.");
      }
      return responseText;
    } finally {
      clearTimeout(timer);
    }
  };

  let utterance = opening;
  console.log(`\nPERSONA (opening):\n${opening}\n`);
  for (let turn = 1; turn <= turns; turn++) {
    const id = `u${turn}`;
    inputId = id;
    record("conversation.jsonl", { role: "user", id, text: utterance });
    const reply = await ask(elicitor, utterance);
    record("conversation.jsonl", { role: "assistant", text: reply });
    save(`ledger-${turn}.md`, ledger.compile().markdown);
    console.log(
      `Exchange ${turn}/${turns}; Ledger r${ledger.compile().revision}; estimated $${spent.toFixed(4)}`,
    );
    if (turn < turns) {
      utterance = await ask(persona, reply);
    }
  }
  if (faux && ledger.compile().revision !== 3) {
    throw new Error(
      "Synthetic SDK rehearsal failed to record its three expected commits.",
    );
  }
  save(
    "outcome.json",
    JSON.stringify(
      {
        state: "completed",
        kind: faux ? "scripted-mechanism-only" : "live-observation-not-grade",
        requests,
        toolCalls,
        estimatedUsd: spent,
        unknownUsage,
      },
      null,
      2,
    ),
  );
} catch (error) {
  save(
    "outcome.json",
    JSON.stringify(
      {
        state: "stopped",
        error: String(error),
        requests,
        toolCalls,
        estimatedUsd: spent,
        unknownUsage,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  save("ledger.md", ledger.compile().markdown);
  for (const session of sessions) {
    session.dispose();
  }
  faux?.unregister();
}
