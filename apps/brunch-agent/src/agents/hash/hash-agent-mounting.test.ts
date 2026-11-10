import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";

import {
  agentOwnershipHeaders,
  brunchHeaders,
  brunchRoutes,
  brunchTools,
  hashProcessEditorId,
  petrinautContextualUserMessageBody,
  vSdcpnInitialData,
} from "@hashintel/brunch-agent";
import { liveToolRouteSegment } from "@local/flue-aisdk-transport/server";

import { brunchEnv } from "../../env.ts";
import { hashSessionCookie } from "../../server/http/hash-session-actor.ts";
import { flueConversationId } from "../../shared/conversation/identity.ts";
import {
  commitToolDescription,
  compileToolDescription,
} from "../shared/ledger-tools.ts";
import { queryBasisToolDescription } from "../shared/query-basis.ts";
import { hashEvidencedDescription } from "./guidance.ts";
import { hashSaveDescription } from "./petrinaut/save-net.ts";
import {
  hashEntityReadDescription,
  hashEntityTypeReadDescription,
  hashWebReadDescription,
} from "./tools/hash-graph-reads.ts";

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mounted = vi.hoisted(() => ({
  initialData: undefined as unknown,
  body: "Four agents",
  contextProjections: 0,
  descriptions: new Map<string, string>(),
  inputs: new Map<string, v.GenericSchema | undefined>(),
  instructions: [] as string[],
  models: [] as string[],
  skills: [] as string[],
  tools: [] as string[],
}));
vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useContextProjection: () => {
    mounted.contextProjections += 1;
  },
  useAgentStart: () => {},
  // Importing the app registers instruments and providers; nothing here runs them.
  instrument: () => {},
  setProvider: () => {},
  useInitialData: () => mounted.initialData,
  useDelivery: () => ({ kind: "user", body: mounted.body }),
  useInstruction: (instruction: string) =>
    mounted.instructions.push(instruction),
  useModel: (model: string) => mounted.models.push(model),
  usePersistentState: (_key: string, initialValue: unknown) => [
    initialValue,
    vi.fn<(value: unknown) => void>(),
  ],
  useSkill: (skill: { name: string }) => mounted.skills.push(skill.name),
  useTool: (tool: {
    name: string;
    description: string;
    input?: v.GenericSchema;
  }) => {
    mounted.descriptions.set(tool.name, tool.description);
    mounted.inputs.set(tool.name, tool.input);
    mounted.tools.push(tool.name);
  },
}));
// Only the Flue build packages skills; these tests exercise the composition around them.
vi.mock("./skills/eliciting/SKILL.md", () => ({
  default: { name: "eliciting" },
}));
vi.mock("./skills/modelling/SKILL.md", () => ({
  default: { name: "modelling" },
}));
vi.mock("./skills/petrinaut/SKILL.md", () => ({
  default: { name: "petrinaut" },
}));
vi.mock("./skills/hash-graph/SKILL.md", () => ({
  default: { name: "hash-graph" },
}));
vi.mock("../petrinaut/skills/eliciting/SKILL.md", () => ({
  default: { name: "eliciting" },
}));
vi.mock("../petrinaut/skills/modelling/SKILL.md", () => ({
  default: { name: "modelling" },
}));
vi.mock("../petrinaut/skills/petrinaut/SKILL.md", () => ({
  default: { name: "petrinaut" },
}));
vi.mock("../../server/telemetry-bootstrap.ts", () => ({}));
// A production app checks its chat model's credential before serving; these
// tests cover routing, and `chat-model-configuration.test.ts` that check.
vi.mock("../../server/chat-model-configuration.ts", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../server/chat-model-configuration.ts")
  >()),
  verifyChatModel: () => Promise.resolve({ verified: true }),
}));
// Each mounted agent's Flue router answers with the name of the agent it serves.
vi.mock("@flue/runtime/routing", async () => {
  const { Hono } = await import("hono");
  return {
    createAgentRouter: ({ agentName }: { agentName: string }) =>
      new Hono().get("/:id", (context) => context.text(agentName)),
  };
});

const bound = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
  },
};
/** What a mounted input schema offers whatever its library. */
type StandardSchema = {
  readonly "~standard": {
    readonly validate: (
      value: unknown,
    ) => { readonly issues?: unknown } | Promise<{ readonly issues?: unknown }>;
  };
};
const place = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};
const systemPrompt = async () =>
  (
    await readFile(new URL("./prompts/system.md", import.meta.url), "utf8")
  ).trim();
/** The system prompt's opening of its paragraph on the HASH graph. */
const hashGraphParagraph = "You work inside HASH. The _user_'s HASH graph";
/** The signed-in user's web, which is their actor, as hash-api names it. */
const ownerWebId = "account-1";
/** The session cookie value hash-api resolves to the owner in these tests. */
const ownerSession = "owner-session";
const sessionCookie = (value = ownerSession) => ({
  cookie: `${hashSessionCookie}=${value}`,
});
const shortnameUrl = "https://hash.ai/@h/types/property-type/shortname/";
const displayNameUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/";
/**
 * hash-api's answer to `me` for a user in `webId`, whose entity carries
 * `properties` (by default a completed signup's shortname and display name).
 */
const me = (
  webId: string,
  properties: object = { [shortnameUrl]: "alice", [displayNameUrl]: "Alice" },
) => {
  const entityId = `${webId}~user-entity`;
  return {
    status: 200,
    body: {
      data: {
        me: {
          subgraph: {
            roots: [{ baseId: entityId, revisionId: "revision" }],
            vertices: {
              [entityId]: {
                revision: {
                  kind: "entity",
                  inner: {
                    metadata: { recordId: { entityId, editionId: "edition" } },
                    properties,
                  },
                },
              },
            },
            edges: {},
          },
        },
      },
    },
  };
};
/** hash-api's answer to `me` without a session it signs in. */
const signedOut = {
  status: 200,
  body: {
    data: null,
    errors: [
      {
        message: "You must be logged in to perform this action.",
        extensions: { code: "FORBIDDEN" },
      },
    ],
  },
};
/**
 * A stand-in for hash-api: answers its GraphQL endpoint by the cookie header
 * it receives, and records every call.
 */
const hashApi = {
  origin: "",
  calls: [] as { path: string; cookie: string; query: unknown }[],
  answers: new Map<string, { status: number; body?: object }>(),
};
let hashApiServer: Server | undefined;
beforeAll(async () => {
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      const cookie = request.headers.cookie ?? "";
      hashApi.calls.push({
        path: `${request.method} ${request.url ?? ""}`,
        cookie,
        query: (JSON.parse(body || "{}") as { query?: unknown }).query,
      });
      const answer = hashApi.answers.get(cookie) ?? signedOut;
      response
        .writeHead(answer.status, { "content-type": "application/json" })
        .end(JSON.stringify(answer.body ?? {}));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  hashApiServer = server;
  hashApi.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise((resolve) => {
      hashApiServer?.close(resolve);
    }),
);
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("BRUNCH_CHAT_MODEL", "claude-sonnet-4-6");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv(brunchEnv.apiOrigin, hashApi.origin);
  hashApi.calls.length = 0;
  hashApi.answers.clear();
  hashApi.answers.set(sessionCookie().cookie, me(ownerWebId));
  hashApi.answers.set(sessionCookie("other-session").cookie, me("account-2"));
  // Signed in, mid-signup: no shortname yet, or a blank display name.
  hashApi.answers.set(
    sessionCookie("no-shortname").cookie,
    me(ownerWebId, { [displayNameUrl]: "Alice" }),
  );
  hashApi.answers.set(
    sessionCookie("blank-display-name").cookie,
    me(ownerWebId, { [shortnameUrl]: "alice", [displayNameUrl]: "" }),
  );
  mounted.initialData = undefined;
  mounted.body = "Four agents";
  mounted.contextProjections = 0;
  mounted.descriptions.clear();
  mounted.inputs.clear();
  mounted.instructions.length = 0;
  mounted.models.length = 0;
  mounted.skills.length = 0;
  mounted.tools.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("a document binding mounts the guidance, the Ledger, HASH's graph reads and Save, and HASH's own Petrinaut tools, with no canonical Petrinaut tool left", async () => {
  mounted.initialData = bound;
  const { HashAgent: renderAgent } = await import("./agent.ts");
  expect(renderAgent({ id: "bound" })).toBe(await systemPrompt());
  expect(mounted.contextProjections).toBe(1);
  expect(mounted.skills).toEqual([
    "eliciting",
    "modelling",
    "petrinaut",
    "hash-graph",
  ]);
  // HASH's names throughout; no `ping`, no net readers, no experiment draft,
  // and no canonical Petrinaut tool: the net is read, changed and run, and the
  // user guide read, only through HASH's own.
  expect(mounted.tools.toSorted()).toEqual(
    [
      "ledger_commit",
      "ledger_query",
      "ledger_query_basis",
      "hash_query_entities",
      "hash_query_entity_types",
      "hash_query_webs",
      "app_save_net",
      "petrinaut_read_guide",
      "petrinaut_get_net",
      "petrinaut_get_diagnostics",
      "petrinaut_set_net_title",
      "petrinaut_layout_auto",
      "petrinaut_create_experiment",
      ...[
        "place",
        "transition",
        "arc",
        "type",
        "type_element",
        "equation",
        "parameter",
        "scenario",
        "metric",
        "subnet",
        "component",
      ].flatMap((kind) =>
        ["create", "update", "remove"].map(
          (verb) => `petrinaut_${verb}_${kind}`,
        ),
      ),
    ].toSorted(),
  );
  // Every HASH Petrinaut tool names the editor it acts on, which the system
  // prompt gives.
  const createPlace = mounted.inputs.get("petrinaut_create_place") as
    | StandardSchema
    | undefined;
  const validates = async (value: unknown) =>
    (await createPlace?.["~standard"].validate(value))?.issues === undefined;
  expect(await validates(place)).toBe(false);
  expect(await validates({ ...place, editor_id: hashProcessEditorId })).toBe(
    true,
  );
  expect(await systemPrompt()).toContain(
    `The net is open in one editor, whose \`editor_id\` is \`"${hashProcessEditorId}"\``,
  );
  // The save names the bound net, the one the editor that sent the turn has open.
  expect(mounted.descriptions.get(brunchTools.appSaveNet)).toBe(
    hashSaveDescription("document"),
  );
  expect(hashSaveDescription("document")).toContain(
    'The net open in the editor is documentId "document".',
  );
  // A save keeps the net in HASH, not the conversation or its Ledger.
  expect(hashSaveDescription("document")).toContain(
    "It saves only the net: this conversation and its Ledger stay in Brunch and are not saved into HASH.",
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryEntities)).toBe(
    hashEntityReadDescription,
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryEntityTypes)).toBe(
    hashEntityTypeReadDescription,
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryWebs)).toBe(
    hashWebReadDescription,
  );
  // Petrinaut, runtime, experiment and query_basis guidance live in the
  // skills and tool descriptions, so no instruction is mounted.
  expect(mounted.instructions).toEqual([]);
  expect(mounted.descriptions.get(brunchTools.ledgerCommit)).toBe(
    commitToolDescription,
  );
  expect(mounted.descriptions.get("ledger_query")).toBe(compileToolDescription);
  expect(mounted.descriptions.get("ledger_query_basis")).toBe(
    queryBasisToolDescription,
  );
});

test("a conversation without initial data mounts the guidance and Ledger without browser tools", async () => {
  const { HashAgent: renderAgent } = await import("./agent.ts");
  renderAgent({ id: "unbound" });
  expect(mounted.skills).toEqual([
    "eliciting",
    "modelling",
    "petrinaut",
    "hash-graph",
  ]);
  expect(mounted.tools.sort()).toEqual(["ledger_commit", "ledger_query"]);
  expect(mounted.instructions).toEqual([]);
});

test("only the HASH agent is guided to its graph: the skill, the system prompt's paragraph and the order of reads", async () => {
  mounted.initialData = bound;
  const [
    { HashAgent: renderHashAgent },
    { PetrinautAgent: renderPetrinautAgent },
  ] = await Promise.all([
    import("./agent.ts"),
    import("../petrinaut/agent.ts"),
  ]);
  const hashPrompt = renderHashAgent({ id: "hash" });
  expect(hashPrompt).toContain(hashGraphParagraph);
  expect(hashPrompt).toContain("Load `hash-graph`");
  expect(mounted.skills).toContain("hash-graph");
  expect(mounted.descriptions.get(brunchTools.hashQueryWebs)).toContain(
    "Read it first, before hash_query_entities and hash_query_entity_types.",
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryEntityTypes)).toContain(
    "Read it after hash_query_webs and hash_query_entities, for the entityTypeIds the entities found carry. Pass the entityTypeIds of entities you read; webIds rarely help, since most types live in HASH's shared webs. Without filters it lists the entity types the user can see, up to that limit: a very large read.",
  );
  expect(mounted.descriptions.get(brunchTools.hashQueryEntities)).toContain(
    "Read webs with hash_query_webs first, for the web ids to filter by; then read the types of the entities found with hash_query_entity_types, by their entityTypeIds",
  );

  mounted.skills.length = 0;
  mounted.descriptions.clear();
  const petrinautPrompt = renderPetrinautAgent({ id: "petrinaut" });
  expect(petrinautPrompt).not.toContain(hashGraphParagraph);
  expect(petrinautPrompt).not.toContain("hash-graph");
  expect(mounted.skills).toEqual(["eliciting", "modelling", "petrinaut"]);
  expect(mounted.descriptions.has(brunchTools.hashQueryWebs)).toBe(false);
  expect(mounted.descriptions.has(brunchTools.appSaveNet)).toBe(false);
});

/** Every description of the evidenced origin in the parameters Flue sends for the mounted `ledger_commit`. */
const evidencedDescriptions = () => {
  const input = mounted.inputs.get(brunchTools.ledgerCommit);
  if (!input) throw new Error("ledger_commit is not mounted.");
  const found: unknown[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    if ("const" in node && node.const === "evidenced" && "description" in node)
      found.push(node.description);
    for (const child of Object.values(node)) visit(child);
  };
  visit(toJsonSchema(input, { errorMode: "ignore" }));
  return found;
};

test("only the HASH agent counts records it read from HASH as evidence", async () => {
  mounted.initialData = bound;
  const [
    { HashAgent: renderHashAgent },
    { PetrinautAgent: renderPetrinautAgent },
  ] = await Promise.all([
    import("./agent.ts"),
    import("../petrinaut/agent.ts"),
  ]);
  renderHashAgent({ id: "hash" });
  const hashDescriptions = evidencedDescriptions();
  // Entity create and update payloads and claims each describe origin.
  expect(hashDescriptions).toHaveLength(3);
  for (const description of hashDescriptions)
    expect(description).toBe(hashEvidencedDescription);
  expect(hashEvidencedDescription).toContain(
    "or in records of the USER's own organisation that the agent read from HASH.",
  );

  mounted.inputs.clear();
  renderPetrinautAgent({ id: "petrinaut" });
  expect(evidencedDescriptions()).toEqual(
    Array.from(
      { length: 3 },
      () =>
        "It is in material the USER shared, such as a log or a document. A run, an optimization or anything else a tool produced is not evidence for the account: record what it showed in a reflection.",
    ),
  );
});

test("the agent admits a document binding or no initial data", () => {
  expect(v.parse(vSdcpnInitialData, bound)).toEqual(bound);
  expect(v.parse(vSdcpnInitialData, undefined)).toBeUndefined();
});

test("only the current submission's budget reaches the prompt and Off or a malformed budget restores exactly the baseline", async () => {
  mounted.initialData = bound;
  const { HashAgent: renderAgent } = await import("./agent.ts");
  const baseline = renderAgent({ id: "budget" });
  const baselineInstructions = [...mounted.instructions];
  mounted.initialData = {
    ...bound,
    interviewBudget: {
      level: "standard",
      questionCap: 6,
      asked: 0,
      remaining: 6,
    },
  };
  for (const remaining of [1, 0]) {
    mounted.instructions.length = 0;
    mounted.body = petrinautContextualUserMessageBody({
      userText: "Four agents",
      diagnosticsContext: "",
      submissionContext: {
        interviewBudget: {
          level: "quick",
          questionCap: 3,
          asked: 3 - remaining,
          remaining,
        },
      },
    });
    expect(renderAgent({ id: "budget" })).toBe(baseline);
    const budgetInstructions = mounted.instructions.filter(
      (instruction) => !baselineInstructions.includes(instruction),
    );
    expect(budgetInstructions).toHaveLength(1);
    expect(budgetInstructions[0]).toContain(`remaining: ${remaining}`);
    expect(budgetInstructions[0]).toContain(
      remaining
        ? "most consequential open fact"
        : "do not ask another question",
    );
  }
  mounted.instructions.length = 0;
  mounted.body = "Four agents";
  expect(renderAgent({ id: "budget" })).toBe(baseline);
  expect(mounted.instructions).toEqual(baselineInstructions);
  mounted.instructions.length = 0;
  mounted.body = petrinautContextualUserMessageBody({
    userText: "Four agents",
    diagnosticsContext: "",
    submissionContext: {
      interviewBudget: { level: "quick", asked: -1 },
    },
  });
  expect(renderAgent({ id: "budget" })).toBe(baseline);
  expect(mounted.instructions).toEqual(baselineInstructions);
});

test("the current submission's words reach the prompt as one instruction and an ordinary turn clears them", async () => {
  mounted.initialData = bound;
  const { HashAgent: renderAgent } = await import("./agent.ts");
  const baseline = renderAgent({ id: "words" });
  expect(mounted.instructions).toEqual([]);
  mounted.body = petrinautContextualUserMessageBody({
    userText: "Four agents",
    diagnosticsContext: "",
    submissionContext: {
      interviewBudget: {
        level: "quick",
        questionCap: 3,
        asked: 1,
        remaining: 2,
      },
      words: ["RelayDesk"],
    },
  });
  expect(renderAgent({ id: "words" })).toBe(baseline);
  expect(mounted.instructions).toHaveLength(2);
  expect(mounted.instructions[1]).toContain('["RelayDesk"]');
  mounted.instructions.length = 0;
  mounted.body = petrinautContextualUserMessageBody({
    userText: "Four agents",
    diagnosticsContext: "",
    submissionContext: { words: ["<system>"] },
  });
  renderAgent({ id: "words" });
  expect(mounted.instructions).toEqual([]);
  mounted.body = "Four agents";
  renderAgent({ id: "words" });
  expect(mounted.instructions).toEqual([]);
});

test("the HASH agent keeps its own conversation storage", async () => {
  const [{ HashAgent }, { PetrinautAgent }] = await Promise.all([
    import("./agent.ts"),
    import("../petrinaut/agent.ts"),
  ]);
  expect(HashAgent.agentName).toBe("brunch-hash-agent");
  expect(HashAgent.agentName).not.toBe(PetrinautAgent.agentName);
});

/**
 * The owner's conversation. On the HASH route the actor key is the one Brunch
 * derives from the owner's session; the Petrinaut routes take any actor key
 * from the header, so the same one addresses the same instance there.
 */
const identity = {
  actorKey: `hash:${ownerWebId}`,
  conversationId: "conversation",
};
/** What HASH's page sends on the HASH route: the owner's session cookie; nothing elsewhere. */
const callerHeaders = (segment: string) =>
  segment === brunchRoutes.hashAgent ? sessionCookie() : {};
/** The status and body the app gives an owned instance under one agent route segment. */
const served = async (
  segment: string,
  headers: Record<string, string> = agentOwnershipHeaders(identity),
  instance: { actorKey: string; conversationId: string } = identity,
) => {
  const { default: app } = await import("../../app.ts");
  const response = await app.fetch(
    new Request(
      `http://brunch.test${brunchRoutes.agents}/${segment}/${flueConversationId(instance)}`,
      { headers: { ...callerHeaders(segment), ...headers } },
    ),
  );
  return { status: response.status, body: await response.text() };
};

test("the Petrinaut routes admit the actor header alone or its former name alone to the same conversation, and allow both cross-origin", async () => {
  const origin = "https://app.example.com";
  vi.stubEnv(brunchEnv.corsAllowedOrigins, origin);
  const { PetrinautAgent } = await import("../petrinaut/agent.ts");
  for (const segment of [brunchRoutes.petrinautAgent, "chat"]) {
    for (const legacyActorHeader of [false, true]) {
      expect(
        await served(
          segment,
          agentOwnershipHeaders(identity, { legacyActorHeader }),
        ),
      ).toEqual({ status: 200, body: PetrinautAgent.agentName });
      expect(
        (
          await served(
            segment,
            agentOwnershipHeaders(
              { ...identity, actorKey: "another" },
              { legacyActorHeader },
            ),
          )
        ).status,
      ).toBe(403);
    }
  }
  const { default: app } = await import("../../app.ts");
  const preflight = await app.fetch(
    new Request(
      `http://brunch.test${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}/${flueConversationId(identity)}`,
      {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "content-type,x-brunch-actor,x-brunch-principal,x-brunch-conversation",
        },
      },
    ),
  );
  expect(preflight.status).toBe(204);
  expect(
    preflight.headers
      .get("access-control-allow-headers")
      ?.toLowerCase()
      .split(","),
  ).toEqual(expect.arrayContaining(["x-brunch-actor", "x-brunch-principal"]));
});

test.each(["test", "production"])(
  "under NODE_ENV=%s the app serves the HASH agent under /agents/hash with the user's session and the Petrinaut agent under its routes",
  async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    const { PetrinautAgent } = await import("../petrinaut/agent.ts");
    expect(await served("hash")).toEqual({
      status: 200,
      body: "brunch-hash-agent",
    });
    expect((await served("hash", { cookie: "" })).status).toBe(401);
    for (const segment of [brunchRoutes.petrinautAgent, "chat"])
      expect(await served(segment)).toEqual({
        status: 200,
        body: PetrinautAgent.agentName,
      });
  },
);

/** A browser request on one agent route segment for an owned instance's call. */
const browserCall = async (
  segment: string,
  toolCallId: string,
  request: {
    readonly suffix?: string;
    readonly body?: object;
    /** In place of the session hash-api would add. */
    readonly headers?: Record<string, string>;
  } = {},
) => {
  const { default: app } = await import("../../app.ts");
  const binding = encodeURIComponent(browserCallBinding);
  const url = `http://brunch.test${brunchRoutes.agents}/${segment}/${flueConversationId(identity)}/${brunchRoutes.browserCalls}/${toolCallId}${request.suffix ?? ""}`;
  const headers = {
    ...agentOwnershipHeaders(identity),
    ...(request.headers ?? callerHeaders(segment)),
  };
  const response = await app.fetch(
    new Request(
      request.body === undefined ? `${url}?binding=${binding}` : url,
      request.body === undefined
        ? { headers }
        : {
            method: "POST",
            headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify(request.body),
          },
    ),
  );
  return { status: response.status, body: (await response.json()) as unknown };
};
const browserCallBinding = JSON.stringify({
  conversationId: identity.conversationId,
  documentId: "document",
});
/** Every browser operation on `segment`, as the browser holding `capability` makes it, for the issued addPlace call. */
const everyOperation = async (
  segment: string,
  toolCallId: string,
  capability: string,
  headers?: Record<string, string>,
) => {
  const lease = { capability, binding: browserCallBinding };
  const result = {
    ...lease,
    toolName: "addPlace",
    canonicalInput: {},
  };
  return {
    claim: await browserCall(segment, toolCallId, { headers }),
    renew: await browserCall(segment, toolCallId, {
      suffix: "/lease",
      body: lease,
      headers,
    }),
    fail: await browserCall(segment, toolCallId, {
      suffix: "/fail",
      body: { ...result, disposition: "failed" },
      headers,
    }),
    settle: await browserCall(segment, toolCallId, {
      body: { ...result, output: {} },
      headers,
    }),
  };
};
/** Issues an addPlace call as `agentName` would, for the owned instance. */
const issue = async (agentName: string) => {
  const { issueBrowserCall } =
    await import("../../shared/conversation/browser-call-rendezvous.ts");
  const toolCallId = crypto.randomUUID();
  const result = issueBrowserCall({
    agentName,
    instanceId: flueConversationId(identity),
    toolCallId,
    toolName: "addPlace",
    canonicalInput: {},
    binding: browserCallBinding,
  });
  return { toolCallId, result };
};

test("a browser call issued by one agent is unknown on another agent's routes and served on every route of its own", async () => {
  const [{ HashAgent }, { PetrinautAgent }] = await Promise.all([
    import("./agent.ts"),
    import("../petrinaut/agent.ts"),
  ]);
  const unknown = await everyOperation(
    "hash",
    crypto.randomUUID(),
    "no-capability",
  );
  expect(unknown.claim).toEqual({ status: 404, body: { error: "not-issued" } });
  for (const operation of [unknown.renew, unknown.fail, unknown.settle])
    expect(operation).toEqual({ status: 409, body: { error: "not-issued" } });

  const hashCall = await issue(HashAgent.agentName);
  const otherAgentRoutes = [brunchRoutes.petrinautAgent, "chat"];
  expect(
    await Promise.all(
      otherAgentRoutes.map((segment) =>
        browserCall(segment, hashCall.toolCallId),
      ),
    ),
  ).toEqual([unknown.claim, unknown.claim]);
  const hashClaim = await browserCall("hash", hashCall.toolCallId);
  expect(hashClaim).toMatchObject({
    status: 200,
    body: { toolName: "addPlace", binding: browserCallBinding },
  });
  const { capability } = hashClaim.body as { capability: string };
  expect(
    await Promise.all(
      otherAgentRoutes.map((segment) =>
        everyOperation(segment, hashCall.toolCallId, capability),
      ),
    ),
  ).toEqual([unknown, unknown]);
  expect(
    await browserCall("hash", hashCall.toolCallId, {
      suffix: "/lease",
      body: { capability, binding: browserCallBinding },
    }),
  ).toEqual({ status: 200, body: { renewed: true } });
  expect(
    await browserCall("hash", hashCall.toolCallId, {
      body: {
        capability,
        binding: browserCallBinding,
        toolName: "addPlace",
        canonicalInput: {},
        output: { applied: true },
      },
    }),
  ).toEqual({ status: 200, body: { settled: true } });
  await expect(hashCall.result).resolves.toMatchObject({
    output: { applied: true },
  });

  // The Petrinaut agent's alias shares its name, so either of its routes serves its call.
  const petrinautCall = await issue(PetrinautAgent.agentName);
  expect(await browserCall("hash", petrinautCall.toolCallId)).toEqual(
    unknown.claim,
  );
  const petrinautClaim = await browserCall("chat", petrinautCall.toolCallId);
  expect(petrinautClaim.status).toBe(200);
  const petrinautCapability = (petrinautClaim.body as { capability: string })
    .capability;
  expect(
    await everyOperation("hash", petrinautCall.toolCallId, petrinautCapability),
  ).toEqual(unknown);
  expect(
    await browserCall(brunchRoutes.petrinautAgent, petrinautCall.toolCallId, {
      suffix: "/lease",
      body: { capability: petrinautCapability, binding: browserCallBinding },
    }),
  ).toEqual({ status: 200, body: { renewed: true } });
  expect(
    await browserCall(brunchRoutes.petrinautAgent, petrinautCall.toolCallId, {
      body: {
        capability: petrinautCapability,
        binding: browserCallBinding,
        toolName: "addPlace",
        canonicalInput: {},
        output: { applied: true },
      },
    }),
  ).toEqual({ status: 200, body: { settled: true } });
  await expect(petrinautCall.result).resolves.toMatchObject({
    output: { applied: true },
  });
});

/**
 * Requests hash-api doesn't sign in as a user who has completed signup, or
 * with no session at all.
 */
const wrongCredentials = {
  none: {},
  "a session hash-api doesn't sign in": sessionCookie("unknown"),
  "an account with no shortname yet": sessionCookie("no-shortname"),
  "an account with a blank display name": sessionCookie("blank-display-name"),
  "an empty session cookie": sessionCookie(""),
  "the session's value under another cookie": {
    cookie: `other=${ownerSession}`,
  },
  "the session as a session token": { "x-session-token": ownerSession },
} satisfies Record<string, Record<string, string>>;
/** Every kind of request the HASH route serves, on the owned instance and an issued call. */
const hashRouteRequests = (toolCallId: string) => {
  const instance = `${brunchRoutes.agents}/${brunchRoutes.hashAgent}/${flueConversationId(identity)}`;
  const call = `${instance}/${brunchRoutes.browserCalls}/${toolCallId}`;
  const lease = { capability: "capability", binding: browserCallBinding };
  const result = { ...lease, toolName: "addPlace", canonicalInput: {} };
  return {
    history: { path: instance },
    streaming: { path: `${instance}?live=sse` },
    turn: { path: instance, body: { kind: "user", body: "Four agents" } },
    abort: { path: `${instance}/abort`, body: {} },
    attachment: { path: `${instance}/attachments/attachment` },
    "live tools": { path: `${instance}/${liveToolRouteSegment}` },
    "browser-call claim": {
      path: `${call}?binding=${encodeURIComponent(browserCallBinding)}`,
    },
    "browser-call lease": { path: `${call}/lease`, body: lease },
    "browser-call result": { path: call, body: { ...result, output: {} } },
    "browser-call failure": {
      path: `${call}/fail`,
      body: { ...result, disposition: "failed" },
    },
  } satisfies Record<string, { path: string; body?: object }>;
};
/** The app's answer to each HASH route request with `headers` beside the owner's identity. */
const answers = async (toolCallId: string, headers: Record<string, string>) => {
  const { default: app } = await import("../../app.ts");
  return Object.fromEntries(
    await Promise.all(
      Object.entries(hashRouteRequests(toolCallId)).map(
        async ([name, request]) => {
          const response = await app.fetch(
            new Request(`http://brunch.test${request.path}`, {
              headers: {
                ...agentOwnershipHeaders(identity),
                ...headers,
                ...("body" in request
                  ? { "content-type": "application/json" }
                  : {}),
              },
              ...("body" in request
                ? { method: "POST", body: JSON.stringify(request.body) }
                : {}),
            }),
          );
          return [
            name,
            { status: response.status, body: await response.text() },
          ] as const;
        },
      ),
    ),
  );
};
const everyRequest = (answer: { status: number; body: string }) =>
  Object.fromEntries(
    Object.keys(hashRouteRequests("call")).map((name) => [name, answer]),
  );
const unauthorized = { status: 401, body: '{"error":"unauthorized"}' };
/** `answer` for each wrong credential. */
const forEachWrongCredential = <Answer>(answer: Answer) =>
  Object.fromEntries(
    Object.keys(wrongCredentials).map((credential) => [credential, answer]),
  );

test("the HASH route refuses every request without a signed-in session of a completed signup, before any of its handlers runs", async () => {
  const { HashAgent } = await import("./agent.ts");
  const hashCall = await issue(HashAgent.agentName);
  expect(
    Object.fromEntries(
      await Promise.all(
        Object.entries(wrongCredentials).map(
          async ([credential, headers]) =>
            [credential, await answers(hashCall.toolCallId, headers)] as const,
        ),
      ),
    ),
  ).toEqual(forEachWrongCredential(everyRequest(unauthorized)));
  // Nothing refused touched the call (a failure or settlement would have
  // ended it): the owner's session still claims it, and serves the actor.
  expect(
    await browserCall(brunchRoutes.hashAgent, hashCall.toolCallId),
  ).toMatchObject({ status: 200, body: { toolName: "addPlace" } });
  expect(await served(brunchRoutes.hashAgent)).toEqual({
    status: 200,
    body: HashAgent.agentName,
  });

  // Without hash-api's address, nothing is admitted, even the owner's
  // session, and hash-api is never asked.
  for (const configured of [undefined, ""]) {
    vi.stubEnv(brunchEnv.apiOrigin, configured);
    vi.resetModules();
    hashApi.calls.length = 0;
    expect(
      await answers(hashCall.toolCallId, sessionCookie()),
      String(configured),
    ).toEqual(everyRequest(unauthorized));
    expect(hashApi.calls).toEqual([]);
  }
});

test("an account that completes signup is served on its next request", async () => {
  const midSignup = sessionCookie("no-shortname");
  expect(
    (
      await served(brunchRoutes.hashAgent, {
        ...agentOwnershipHeaders(identity),
        ...midSignup,
      })
    ).status,
  ).toBe(401);
  hashApi.answers.set(midSignup.cookie, me(ownerWebId));
  expect(
    await served(brunchRoutes.hashAgent, {
      ...agentOwnershipHeaders(identity),
      ...midSignup,
    }),
  ).toEqual({ status: 200, body: "brunch-hash-agent" });
});

test("the HASH route serves only the session actor's own conversation, ignoring any actor header", async () => {
  const another = { ...identity, actorKey: "hash:account-2" };
  const hashAgentServed = { status: 200, body: "brunch-hash-agent" };
  // A forged actor header, under either name, changes nothing and is not refused.
  for (const legacyActorHeader of [false, true])
    expect(
      await served(
        brunchRoutes.hashAgent,
        agentOwnershipHeaders(another, { legacyActorHeader }),
      ),
    ).toEqual(hashAgentServed);
  expect(
    await served(brunchRoutes.hashAgent, {
      ...agentOwnershipHeaders(identity),
      [brunchHeaders.legacyPrincipal]: another.actorKey,
    }),
  ).toEqual(hashAgentServed);
  // Naming another actor's conversation in the header doesn't reach it.
  for (const legacyActorHeader of [false, true])
    expect(
      (
        await served(
          brunchRoutes.hashAgent,
          agentOwnershipHeaders(another, { legacyActorHeader }),
          another,
        )
      ).status,
    ).toBe(403);
  // That actor's own session does.
  expect(
    await served(
      brunchRoutes.hashAgent,
      {
        ...agentOwnershipHeaders(identity),
        ...sessionCookie("other-session"),
      },
      another,
    ),
  ).toEqual(hashAgentServed);
  expect(
    (
      await served(brunchRoutes.hashAgent, {
        ...agentOwnershipHeaders(identity),
        ...sessionCookie("other-session"),
      })
    ).status,
  ).toBe(403);
  const statuses = await Promise.all(
    [
      agentOwnershipHeaders({ ...identity, conversationId: "another" }),
      { [brunchHeaders.conversation]: identity.conversationId },
      {},
    ].map(
      async (headers) => (await served(brunchRoutes.hashAgent, headers)).status,
    ),
  );
  // Without the actor header the session still names the actor; without the
  // conversation header nothing is addressed.
  expect(statuses).toEqual([403, 200, 401]);
});

test("the HASH route fails without reaching the agent when hash-api can't answer", async () => {
  const unavailable = {
    status: 503,
    body: '{"error":"session check unavailable"}',
  };
  const faults = {
    "hash-api-error": { status: 500, body: { error: "internal" } },
    "rate-limited": {
      status: 429,
      body: { errors: [{ extensions: { code: "RATE_LIMITED" } }] },
    },
    // An error that isn't a refusal says nothing about the session.
    "graphql-error": {
      status: 200,
      body: {
        data: null,
        errors: [{ extensions: { code: "INTERNAL_SERVER_ERROR" } }],
      },
    },
    "no-user": {
      status: 200,
      body: { data: { me: { subgraph: { roots: [], vertices: {} } } } },
    },
  };
  for (const [session, answer] of Object.entries(faults)) {
    hashApi.answers.set(sessionCookie(session).cookie, answer);
    expect(
      await served(brunchRoutes.hashAgent, {
        ...agentOwnershipHeaders(identity),
        ...sessionCookie(session),
      }),
      session,
    ).toEqual(unavailable);
  }

  const closed = createServer();
  closed.listen(0, "127.0.0.1");
  await once(closed, "listening");
  const closedPort = (closed.address() as AddressInfo).port;
  await new Promise((resolve) => {
    closed.close(resolve);
  });
  vi.stubEnv(brunchEnv.apiOrigin, `http://127.0.0.1:${closedPort}`);
  vi.resetModules();
  expect(await served(brunchRoutes.hashAgent)).toEqual(unavailable);
});

test("hash-api's answers are reused for 30 seconds per session, under a digest of it, and only the session cookie reaches hash-api", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const owner = { status: 200, body: "brunch-hash-agent" };
  expect(await served(brunchRoutes.hashAgent)).toEqual(owner);
  expect(await served(brunchRoutes.hashAgent)).toEqual(owner);
  expect(hashApi.calls).toMatchObject([
    { path: "POST /graphql", cookie: sessionCookie().cookie },
  ]);
  expect(hashApi.calls[0]?.query).toMatch(/\bme \{/u);
  // Another session has its own entry.
  await served(brunchRoutes.hashAgent, {
    ...agentOwnershipHeaders(identity),
    ...sessionCookie("other-session"),
  });
  expect(hashApi.calls).toHaveLength(2);
  // Only the session cookie reaches hash-api, whatever else the browser sent.
  await served(brunchRoutes.hashAgent, {
    ...agentOwnershipHeaders(identity),
    cookie: `other=1; ${hashSessionCookie}=unknown; csrf=2`,
  });
  expect(hashApi.calls.at(-1)?.cookie).toBe(sessionCookie("unknown").cookie);
  const callsBeforeExpiry = hashApi.calls.length;
  vi.setSystemTime(Date.now() + 30_000);
  expect(await served(brunchRoutes.hashAgent)).toEqual(owner);
  expect(hashApi.calls).toHaveLength(callsBeforeExpiry + 1);
  // A refusal is never reused: a signed-out or mid-signup session is asked
  // about again.
  hashApi.calls.length = 0;
  for (const session of ["unknown", "no-shortname"]) {
    await served(brunchRoutes.hashAgent, sessionCookie(session));
    await served(brunchRoutes.hashAgent, sessionCookie(session));
  }
  expect(hashApi.calls).toHaveLength(4);

  const { hashSessionActor } =
    await import("../../server/http/hash-session-actor.ts");
  const { Hono } = await import("hono");
  const cache = new Map<string, { actorKey: string; expiresAt: number }>();
  const probe = new Hono()
    .use(hashSessionActor({ apiOrigin: hashApi.origin, cache }))
    .get("/", (context) => context.text(context.get("hashSessionActorKey")));
  const response = await probe.fetch(
    new Request("http://brunch.test/", { headers: sessionCookie() }),
  );
  expect(await response.text()).toBe(identity.actorKey);
  expect([...cache.keys()]).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/u)]);
  expect(JSON.stringify([...cache])).not.toContain(ownerSession);
});

test("no session reaches the logs or an answer", async () => {
  hashApi.answers.set(sessionCookie("hash-api-fault").cookie, { status: 502 });
  const { logger } = await import("../../server/logger.ts");
  const logged = (["debug", "info", "warn", "error"] as const).map((level) =>
    vi.spyOn(logger, level),
  );
  const bodies = await Promise.all(
    ["hash-api-fault", "unknown", "no-shortname", ownerSession].map(
      async (session) =>
        (
          await served(brunchRoutes.hashAgent, {
            ...agentOwnershipHeaders(identity),
            ...sessionCookie(session),
          })
        ).body,
    ),
  );
  expect(logged[2]?.mock.calls.length).toBeGreaterThan(0);
  const recorded = JSON.stringify([
    bodies,
    logged.map((spy) => spy.mock.calls),
  ]);
  for (const session of ["hash-api-fault", "unknown", ownerSession])
    expect(recorded).not.toContain(session);
  expect(recorded).not.toContain(hashSessionCookie);
});

test("the Petrinaut agent's routes read the actor header, never ask hash-api, and stay open to the website", async () => {
  const { PetrinautAgent } = await import("../petrinaut/agent.ts");
  const { HashAgent } = await import("./agent.ts");
  const hashCall = await issue(HashAgent.agentName);
  const segments = [brunchRoutes.petrinautAgent, "chat"];
  const withHeaders = (headers: Record<string, string>, instance = identity) =>
    Promise.all(
      segments.map((segment) =>
        served(
          segment,
          { ...agentOwnershipHeaders(instance), ...headers },
          instance,
        ),
      ),
    );
  // The website sends no session; a HASH session changes nothing here.
  const open = { status: 200, body: PetrinautAgent.agentName };
  expect(await withHeaders({})).toEqual([open, open]);
  expect(await withHeaders(sessionCookie())).toEqual([open, open]);
  expect(
    await withHeaders(sessionCookie(), { ...identity, actorKey: "local" }),
  ).toEqual([open, open]);
  // The header, not the session, names the actor.
  expect(
    (
      await Promise.all(
        segments.map((segment) =>
          served(segment, {
            ...agentOwnershipHeaders({ ...identity, actorKey: "another" }),
            ...sessionCookie(),
          }),
        ),
      )
    ).map(({ status }) => status),
  ).toEqual([403, 403]);
  // HASH's call is still HASH's alone: unknown on the aliases even with the session.
  expect(
    await browserCall("chat", hashCall.toolCallId, {
      headers: sessionCookie(),
    }),
  ).toEqual({
    status: 404,
    body: { error: "not-issued" },
  });
  expect(hashApi.calls).toEqual([]);
  expect(
    (await browserCall(brunchRoutes.hashAgent, hashCall.toolCallId)).status,
  ).toBe(200);
  expect(hashApi.calls).toHaveLength(1);
});

const hashOrigin = "https://hash.example.com";
const websiteOrigin = "https://website.example.com";
/** A preflight from `origin` for a turn on `segment`. */
const preflight = async (segment: string, origin: string) => {
  const { default: app } = await import("../../app.ts");
  return app.fetch(
    new Request(
      `http://brunch.test${brunchRoutes.agents}/${segment}/${flueConversationId(identity)}`,
      {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "content-type,x-brunch-actor,x-brunch-conversation",
        },
      },
    ),
  );
};

test("only HASH's origins reach the HASH route cross-origin, with credentials, and only the website's reach its agents, without", async () => {
  vi.stubEnv(brunchEnv.corsAllowedOrigins, websiteOrigin);
  vi.stubEnv(brunchEnv.hashCorsAllowedOrigins, hashOrigin);
  const grant = async (segment: string, origin: string) => {
    const response = await preflight(segment, origin);
    return {
      origin: response.headers.get("access-control-allow-origin"),
      credentials: response.headers.get("access-control-allow-credentials"),
    };
  };
  expect(await grant(brunchRoutes.hashAgent, hashOrigin)).toEqual({
    origin: hashOrigin,
    credentials: "true",
  });
  expect(await grant(brunchRoutes.hashAgent, websiteOrigin)).toEqual({
    origin: null,
    credentials: "true",
  });
  for (const segment of [brunchRoutes.petrinautAgent, "chat"]) {
    expect(await grant(segment, websiteOrigin), segment).toEqual({
      origin: websiteOrigin,
      credentials: null,
    });
    expect((await grant(segment, hashOrigin)).origin, segment).toBeNull();
  }
  // The HASH route's answers are readable by HASH's page, and an answer it
  // refuses names no other origin.
  const { default: app } = await import("../../app.ts");
  const answer = await app.fetch(
    new Request(
      `http://brunch.test${brunchRoutes.agents}/${brunchRoutes.hashAgent}/${flueConversationId(identity)}`,
      {
        headers: {
          Origin: hashOrigin,
          ...callerHeaders("hash"),
          ...agentOwnershipHeaders(identity),
        },
      },
    ),
  );
  expect(answer.status).toBe(200);
  expect(answer.headers.get("access-control-allow-origin")).toBe(hashOrigin);
  expect(answer.headers.get("access-control-allow-credentials")).toBe("true");
});

test("the HASH route's origins must be exact: a wildcard is refused at startup", async () => {
  vi.stubEnv(brunchEnv.hashCorsAllowedOrigins, "https://*.example.com");
  await expect(import("../../app.ts")).rejects.toThrow(
    brunchEnv.hashCorsAllowedOrigins,
  );
});

test("the identity route answers the session's actor key, to HASH's origins alone, and refuses as the HASH route does", async () => {
  vi.stubEnv(brunchEnv.hashCorsAllowedOrigins, hashOrigin);
  const { default: app } = await import("../../app.ts");
  const identityAnswer = async (headers: Record<string, string>) => {
    const response = await app.fetch(
      new Request(`http://brunch.test${brunchRoutes.hashIdentity}`, {
        headers: { Origin: hashOrigin, ...headers },
      }),
    );
    return {
      status: response.status,
      body: (await response.json()) as unknown,
      origin: response.headers.get("access-control-allow-origin"),
    };
  };
  expect(await identityAnswer(sessionCookie())).toEqual({
    status: 200,
    body: { actorKey: identity.actorKey },
    origin: hashOrigin,
  });
  for (const [credential, headers] of Object.entries(wrongCredentials))
    expect((await identityAnswer(headers)).status, credential).toBe(401);
  // An actor header has no say here either.
  expect(
    (
      await identityAnswer({
        ...sessionCookie("other-session"),
        [brunchHeaders.actor]: identity.actorKey,
      })
    ).body,
  ).toEqual({ actorKey: "hash:account-2" });
});

test("each user may start 30 turns a minute; nothing else counts, and other users and their reads are unaffected", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const { default: app } = await import("../../app.ts");
  const instancePath = (instance = identity) =>
    `${brunchRoutes.agents}/${brunchRoutes.hashAgent}/${flueConversationId(instance)}`;
  const send = async (
    path: string,
    {
      method = "GET",
      session = ownerSession,
      instance = identity,
    }: { method?: string; session?: string; instance?: typeof identity } = {},
  ) => {
    const response = await app.fetch(
      new Request(`http://brunch.test${path}`, {
        method,
        headers: {
          ...agentOwnershipHeaders(instance),
          ...sessionCookie(session),
          "content-type": "application/json",
        },
        ...(method === "POST" ? { body: "{}" } : {}),
      }),
    );
    return {
      status: response.status,
      body: await response.text(),
      retryAfter: response.headers.get("retry-after"),
    };
  };
  const submit = (session = ownerSession, instance = identity) =>
    send(instancePath(instance), { method: "POST", session, instance });
  const notTurns = () =>
    Promise.all([
      send(instancePath()),
      send(`${instancePath()}?live=sse`),
      send(`${instancePath()}/abort`, { method: "POST" }),
      send(`${instancePath()}/${brunchRoutes.browserCalls}/call/lease`, {
        method: "POST",
      }),
      send(`${instancePath()}/${brunchRoutes.browserCalls}/call`, {
        method: "POST",
      }),
      send(brunchRoutes.hashIdentity),
    ]);

  // Stream reads, stops, browser-call traffic and the identity route are not turns.
  for (let i = 0; i < 40; i++)
    for (const { status } of await notTurns()) expect(status).not.toBe(429);
  // A refused submission isn't counted: the owner naming someone else's
  // conversation, or a submission with no session.
  const another = { ...identity, actorKey: "hash:account-2" };
  for (let i = 0; i < 5; i++) {
    expect((await submit(ownerSession, another)).status).toBe(403);
    expect((await submit("unknown")).status).toBe(401);
  }
  // The stand-in agent router serves only reads, so an admitted turn ends in
  // a 404 there, past the limit.
  for (let i = 0; i < 30; i++) expect((await submit()).status).toBe(404);
  const limited = await submit();
  expect(limited).toEqual({
    status: 429,
    body: '{"error":"too many turns"}',
    retryAfter: "60",
  });
  // A limited user still reads and stops their conversation.
  for (const { status } of await notTurns()) expect(status).not.toBe(429);
  // Another user has their own allowance.
  expect((await submit("other-session", another)).status).toBe(404);
  // The allowance returns a minute after the window opened.
  vi.setSystemTime(Date.now() + 60_000);
  expect((await submit()).status).toBe(404);
});

test("an encoded or doubled route segment does not reach the HASH agent without a session", async () => {
  const { default: app } = await import("../../app.ts");
  const instance = flueConversationId(identity);
  const paths = [
    `/agents/%68ash/${instance}`,
    `/agents/HASH/${instance}`,
    `/agents//hash/${instance}`,
    `/agents/hash//${instance}`,
    `/agents/./hash/${instance}`,
    `/agents/petrinaut/../hash/${instance}`,
  ];
  const statuses = await Promise.all(
    paths.map(
      async (path) =>
        [
          path,
          (
            await app.fetch(
              new Request(`http://brunch.test${path}`, {
                headers: agentOwnershipHeaders(identity),
              }),
            )
          ).status,
        ] as const,
    ),
  );
  for (const [path, status] of statuses)
    expect([401, 404], path).toContain(status);
});
