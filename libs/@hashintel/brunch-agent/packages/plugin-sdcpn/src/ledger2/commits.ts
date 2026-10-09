import * as v from "valibot";

import { brunchTools } from "@hashintel/brunch-agent/constants";

import { vLedgerAppend, type LedgerAppend } from "./append";

import type {
  ClaimRecord,
  EntityRecord,
  LedgerState,
  ReflectionRecord,
} from "./projection";

/** Structural view of a conversation history; Flue and AI SDK messages both fit. */
export interface LedgerHistoryMessage {
  readonly id: string;
  readonly role: string;
  readonly purpose?: string;
  readonly parts: readonly unknown[];
}

export interface LedgerHistory {
  readonly messages: readonly LedgerHistoryMessage[];
}

const toolPartSchema = v.object({
  type: v.literal("dynamic-tool"),
  toolName: v.string(),
  toolCallId: v.string(),
  state: v.string(),
  input: v.optional(v.unknown()),
  output: v.optional(v.unknown()),
});

type ToolPart = v.InferOutput<typeof toolPartSchema>;

interface LedgerCall {
  readonly part: ToolPart;
  /**
   * Whether an earlier `ledger_commit` in the same response has not settled.
   * A response's steps run in order, so only a sibling in the same proposal
   * can still be running.
   */
  readonly followsUnsettledCall: boolean;
  readonly afterMessageId?: string;
}

const isSettled = (part: ToolPart) => part.state.startsWith("output-");

/** Every `ledger_commit` call in canonical order, whatever its state. */
const ledgerCalls = (history: LedgerHistory): LedgerCall[] => {
  let afterMessageId: string | undefined;
  return history.messages.flatMap((message) => {
    if (message.role === "user" && (message.purpose ?? "user") === "user") {
      afterMessageId = message.id;
      return [];
    }
    if (message.role !== "assistant") return [];
    const parts = message.parts.flatMap((candidate) => {
      const parsed = v.safeParse(toolPartSchema, candidate);
      return parsed.success &&
        parsed.output.toolName === brunchTools.ledgerCommit
        ? [parsed.output]
        : [];
    });
    return parts.map((part, index): LedgerCall => {
      const followsUnsettledCall = parts
        .slice(0, index)
        .some((earlier) => !isSettled(earlier));
      return afterMessageId === undefined
        ? { part, followsUnsettledCall }
        : { part, followsUnsettledCall, afterMessageId };
    });
  });
};

export const ledgerAppendRefusalCodes = [
  "unknown-address",
  "concurrent-commit",
] as const;

export const ledgerAppendOutputSchema = v.variant("status", [
  v.object({
    status: v.literal("recorded"),
    commitId: v.string(),
    revision: v.number(),
    /** System-assigned record IDs, aligned with the submitted entries queue. */
    ids: v.array(v.string()),
  }),
  v.object({
    status: v.literal("refused"),
    /** Hosts mark a result with `applied: false` as having written nothing. */
    applied: v.literal(false),
    code: v.picklist(ledgerAppendRefusalCodes),
    message: v.string(),
    revision: v.number(),
  }),
]);

export type LedgerAppendOutput = v.InferOutput<typeof ledgerAppendOutputSchema>;

export interface AcceptedCommit {
  readonly commitId: string;
  readonly revision: number;
  readonly afterMessageId?: string;
  readonly ids: readonly string[];
}

const emptyState = (): LedgerState => ({
  title: "Ledger",
  turns: [],
  entities: [],
  claims: [],
  reflections: [],
});

const highestAddress = (records: readonly { address: string }[]) =>
  records.reduce(
    (highest, { address }) => Math.max(highest, Number(address.slice(1))),
    0,
  );

type Derivation =
  | { readonly ids: string[]; readonly state: LedgerState }
  | { readonly refusal: { code: "unknown-address"; message: string } };

/**
 * Assign queue-aligned addresses and resolve every reference against the
 * state before this batch plus the batch's own records. Addresses are
 * deterministic from prior state, so re-deriving an interrupted commit
 * yields the same IDs.
 */
const deriveBatch = (
  state: LedgerState,
  entries: LedgerAppend["entries"],
  turn: string,
): Derivation => {
  const counters = {
    entity: highestAddress(state.entities),
    claim: highestAddress(state.claims),
    reflection: highestAddress(state.reflections),
  };
  const addressed = entries.map((entry) => {
    const [route] = entry;
    let address: string;
    if (route === "entity/create") {
      counters.entity += 1;
      address = `e${counters.entity}`;
    } else if (route === "claim/create") {
      counters.claim += 1;
      address = `c${counters.claim}`;
    } else if (route === "reflection/create") {
      counters.reflection += 1;
      address = `r${counters.reflection}`;
    } else {
      address = route.slice("entity/update/".length);
    }
    return { entry, address };
  });

  const priorEntities = new Map(
    state.entities.map((record) => [record.address, record]),
  );
  const priorClaims = new Set(state.claims.map((record) => record.address));
  const createdEntities = new Set<string>();
  const createdClaims = new Set<string>();
  for (const { entry, address } of addressed) {
    if (entry[0] === "entity/create") createdEntities.add(address);
    if (entry[0] === "claim/create") createdClaims.add(address);
  }
  const entityKnown = (address: string) =>
    priorEntities.has(address) || createdEntities.has(address);
  const claimKnown = (address: string) =>
    priorClaims.has(address) || createdClaims.has(address);
  const resolveReference = (reference: string) =>
    reference.startsWith("$")
      ? (addressed[Number(reference.slice(1))]?.address ?? reference)
      : reference;

  const refusal = (message: string): Derivation => ({
    refusal: { code: "unknown-address", message },
  });

  const entityUpdates = new Map<string, EntityRecord>();
  const newEntities: EntityRecord[] = [];
  const newClaims: ClaimRecord[] = [];
  const newReflections: ReflectionRecord[] = [];

  for (const { entry, address } of addressed) {
    const [route, payload] = entry;
    if (route === "claim/create") {
      const entities = payload.entities.map(resolveReference);
      for (const reference of entities)
        if (!entityKnown(reference))
          return refusal(`Unknown entity ${reference}.`);
      const supersedes = (payload.supersedes ?? []).map(resolveReference);
      for (const reference of supersedes)
        if (!claimKnown(reference))
          return refusal(`Unknown claim ${reference}.`);
      newClaims.push({
        address,
        text: payload.text,
        entities,
        origin: payload.origin,
        status: payload.status,
        ...(supersedes.length > 0 ? { supersedes } : {}),
        turn,
      });
    } else if (route === "reflection/create") {
      const claims = (payload.claims ?? []).map(resolveReference);
      for (const reference of claims)
        if (!claimKnown(reference))
          return refusal(`Unknown claim ${reference}.`);
      const entities = (payload.entities ?? []).map(resolveReference);
      for (const reference of entities)
        if (!entityKnown(reference))
          return refusal(`Unknown entity ${reference}.`);
      newReflections.push({
        address,
        text: payload.text,
        ...(payload.netElements === undefined
          ? {}
          : { netElements: payload.netElements }),
        ...(claims.length > 0 ? { claims } : {}),
        ...(entities.length > 0 ? { entities } : {}),
        turn,
      });
    } else {
      const record: EntityRecord = {
        address,
        name: payload.name,
        kind: payload.kind,
        origin: payload.origin,
        status: payload.status,
        turn,
      };
      if (route === "entity/create") {
        newEntities.push(record);
      } else {
        if (!priorEntities.has(address))
          return refusal(
            `Unknown entity ${address}; entity/update addresses an existing record.`,
          );
        entityUpdates.set(address, record);
      }
    }
  }

  const turns =
    turn !== "" && !state.turns.some((existing) => existing.id === turn)
      ? [...state.turns, { id: turn, excerpt: "" }]
      : state.turns;

  return {
    ids: addressed.map(({ address }) => address),
    state: {
      title: state.title,
      turns,
      entities: [
        ...state.entities.map(
          (record) => entityUpdates.get(record.address) ?? record,
        ),
        ...newEntities,
      ],
      claims: [...state.claims, ...newClaims],
      reflections: [...state.reflections, ...newReflections],
    },
  };
};

export interface FoldedLedger {
  readonly state: LedgerState;
  readonly commits: readonly AcceptedCommit[];
  readonly revision: number;
}

/**
 * Fold accepted commits in canonical order. A call counts only when its
 * recorded input and successful output agree on the call identity and on the
 * IDs the input yields after the commits before it. Pending, refused, failed,
 * malformed and disagreeing calls contribute nothing. `before` stops at the
 * named call without including it.
 */
export const foldCommits = (
  history: LedgerHistory,
  before?: string,
): FoldedLedger => {
  let state = emptyState();
  const commits: AcceptedCommit[] = [];
  for (const call of ledgerCalls(history)) {
    if (call.part.toolCallId === before) break;
    if (call.part.state !== "output-available") continue;
    const input = v.safeParse(vLedgerAppend, call.part.input);
    const output = v.safeParse(ledgerAppendOutputSchema, call.part.output);
    if (!input.success || !output.success) continue;
    const recorded = output.output;
    if (
      recorded.status !== "recorded" ||
      recorded.commitId !== call.part.toolCallId
    )
      continue;
    const derived = deriveBatch(
      state,
      input.output.entries,
      call.afterMessageId ?? "",
    );
    if ("refusal" in derived) continue;
    const agrees =
      recorded.ids.length === derived.ids.length &&
      derived.ids.every((id, index) => recorded.ids[index] === id);
    if (!agrees) continue;
    commits.push({
      commitId: call.part.toolCallId,
      revision: commits.length + 1,
      ...(call.afterMessageId === undefined
        ? {}
        : { afterMessageId: call.afterMessageId }),
      ids: derived.ids,
    });
    state = derived.state;
  }
  return { state, commits, revision: commits.length };
};

/** Record one batch, or refuse it; deterministic over the same history. */
export const prepareAppend = (call: {
  readonly history: LedgerHistory;
  readonly toolCallId: string;
  readonly entries: LedgerAppend["entries"];
}): LedgerAppendOutput => {
  const own = ledgerCalls(call.history).find(
    (candidate) => candidate.part.toolCallId === call.toolCallId,
  );
  const { state, revision } = foldCommits(call.history, call.toolCallId);
  if (own?.followsUnsettledCall)
    return {
      status: "refused",
      applied: false,
      code: "concurrent-commit",
      message:
        "An earlier ledger_commit in this response has not settled; wait for its result.",
      revision,
    };
  const derived = deriveBatch(state, call.entries, own?.afterMessageId ?? "");
  if ("refusal" in derived)
    return {
      status: "refused",
      applied: false,
      code: derived.refusal.code,
      message: derived.refusal.message,
      revision,
    };
  return {
    status: "recorded",
    commitId: call.toolCallId,
    revision: revision + 1,
    ids: derived.ids,
  };
};
