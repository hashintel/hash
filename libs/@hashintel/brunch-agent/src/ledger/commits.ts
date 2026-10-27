import * as v from "valibot";

import { brunchTools } from "../constants";
import { petrinautUserMessageText } from "../petrinaut/contextual-user-message";
import { vLedgerAppend, type LedgerAppend } from "./append";
import { owedObligations, projectLedger } from "./projection/project-ledger";
import { questionStatuses, type Origin } from "./shared/epistemics";

import type {
  ClaimRecord,
  EntityRecord,
  LedgerState,
  ObligationRecord,
  ReflectionRecord,
  Turn,
} from "./projection/records";
import type { FlueConversationMessage } from "@flue/sdk";

/** A Flue conversation message as the fold reads it: parts stay `unknown` because the fold parses them. */
export type LedgerHistoryMessage = Pick<
  FlueConversationMessage,
  "id" | "role"
> &
  Partial<Pick<FlueConversationMessage, "purpose">> & {
    readonly parts: readonly unknown[];
  };

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
  /** The user message the call followed, which anchors its records' turn. */
  readonly turn?: Turn;
}

const isSettled = (part: ToolPart) => part.state.startsWith("output-");

const isUserMessage = (message: LedgerHistoryMessage) =>
  message.role === "user" && (message.purpose ?? "user") === "user";

const textPartSchema = v.object({ type: v.literal("text"), text: v.string() });

const turnExcerptLength = 240;

/** The opening of a user message's text, enough to recognise the turn by. */
const turnExcerpt = (message: LedgerHistoryMessage): string => {
  const text = petrinautUserMessageText(
    message.parts
      .flatMap((part) => {
        const parsed = v.safeParse(textPartSchema, part);
        return parsed.success ? [parsed.output.text] : [];
      })
      .join(" "),
  )
    .replace(/\s+/g, " ")
    .trim();
  const characters = Array.from(text);
  return characters.length > turnExcerptLength
    ? `${characters.slice(0, turnExcerptLength - 1).join("")}…`
    : text;
};

/** Every `ledger_commit` call in canonical order, whatever its state. */
const ledgerCalls = (history: LedgerHistory): LedgerCall[] => {
  let turn: Turn | undefined;
  return history.messages.flatMap((message) => {
    if (isUserMessage(message)) {
      turn = { id: message.id, excerpt: turnExcerpt(message) };
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
      return turn === undefined
        ? { part, followsUnsettledCall }
        : { part, followsUnsettledCall, turn };
    });
  });
};

export const ledgerAppendRefusalCodes = [
  "unknown-address",
  "concurrent-commit",
  "claim-without-entity",
] as const;

export const ledgerAppendOutputSchema = v.variant("status", [
  v.object({
    status: v.literal("recorded"),
    commitId: v.string(),
    revision: v.number(),
    /** System-assigned record IDs, aligned with the submitted entries queue. */
    ids: v.array(v.string()),
    /** USER messages so far, through the one this commit follows. */
    exchanges: v.optional(v.number()),
    /** Current open and conflicted claims after this commit. */
    openQuestions: v.optional(v.number()),
    /** Obligations no reflection has discharged yet; absent when none are owed. */
    owed: v.optional(v.array(v.object({ id: v.string(), text: v.string() }))),
    /** Consequences of this commit the model should weigh; absent when there are none. */
    notes: v.optional(v.array(v.string())),
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

/** A `ledger_commit` result that recorded nothing and says why. */
export const isRefusedLedgerCommit = (
  output: unknown,
): output is Extract<LedgerAppendOutput, { status: "refused" }> => {
  const parsed = v.safeParse(ledgerAppendOutputSchema, output);
  return parsed.success && parsed.output.status === "refused";
};

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
  obligations: [],
});

const highestAddress = (records: readonly { address: string }[]) =>
  records.reduce(
    (highest, { address }) => Math.max(highest, Number(address.slice(1))),
    0,
  );

/** The highest address issued per record type. */
interface AddressCounters {
  readonly entity: number;
  readonly claim: number;
  readonly reflection: number;
  readonly obligation: number;
}

const noReservedAddresses: AddressCounters = {
  entity: 0,
  claim: 0,
  reflection: 0,
  obligation: 0,
};

const countersOf = (
  state: LedgerState,
  reserved: AddressCounters,
): AddressCounters => ({
  entity: Math.max(highestAddress(state.entities), reserved.entity),
  claim: Math.max(highestAddress(state.claims), reserved.claim),
  reflection: Math.max(highestAddress(state.reflections), reserved.reflection),
  obligation: Math.max(highestAddress(state.obligations), reserved.obligation),
});

const counterOf = (address: string): keyof AddressCounters | undefined => {
  switch (address.charAt(0)) {
    case "e":
      return "entity";
    case "c":
      return "claim";
    case "r":
      return "reflection";
    case "o":
      return "obligation";
    default:
      return undefined;
  }
};

/**
 * Reserve the addresses a rejected commit occupied, so later commits keep the
 * IDs they were issued and no ID is issued twice. Only an address that
 * continues its type's sequence counts, so no receipt reserves past what an
 * honest commit could have issued.
 */
const reserveAddresses = (
  counters: AddressCounters,
  ids: readonly string[],
): AddressCounters => {
  const next = { ...counters };
  for (const id of ids) {
    const counter = counterOf(id);
    if (counter !== undefined && id.slice(1) === String(next[counter] + 1))
      next[counter] += 1;
  }
  return next;
};

/** Why a new claim would never be shown, if one would not. */
const claimWithoutEntity = (
  entries: LedgerAppend["entries"],
): string | undefined => {
  for (const [index, [route, payload]] of entries.entries())
    if (
      route === "claim/create" &&
      payload.entities.length === 0 &&
      !questionStatuses.has(payload.status)
    )
      return `Claim $${index} is ${payload.status} but names no entity, so the Ledger map would never show it. Reference the entities it is about, or record an unresolved gap as an open claim.`;
  return undefined;
};

type Derivation =
  | { readonly ids: string[]; readonly state: LedgerState }
  | { readonly refusal: { code: "unknown-address"; message: string } };

/**
 * Assign queue-aligned addresses and resolve every reference against the
 * state before this batch plus the batch's own records. Addresses are
 * deterministic from prior state and the addresses rejected commits reserve,
 * so re-deriving an interrupted commit yields the same IDs.
 */
const deriveBatch = (
  state: LedgerState,
  entries: LedgerAppend["entries"],
  anchor: Turn | undefined,
  reserved: AddressCounters,
): Derivation => {
  const turn = anchor?.id ?? "";
  const counters = { ...countersOf(state, reserved) };
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
    } else if (route === "obligation/create") {
      counters.obligation += 1;
      address = `o${counters.obligation}`;
    } else {
      address = route.slice("entity/update/".length);
    }
    return { entry, address };
  });

  const priorEntities = new Map(
    state.entities.map((record) => [record.address, record]),
  );
  const priorClaims = new Set(state.claims.map((record) => record.address));
  const priorObligations = new Set(
    state.obligations.map((record) => record.address),
  );
  const createdEntities = new Set<string>();
  const createdClaims = new Set<string>();
  const createdObligations = new Set<string>();
  for (const { entry, address } of addressed) {
    if (entry[0] === "entity/create") createdEntities.add(address);
    if (entry[0] === "claim/create") createdClaims.add(address);
    if (entry[0] === "obligation/create") createdObligations.add(address);
  }
  const entityKnown = (address: string) =>
    priorEntities.has(address) || createdEntities.has(address);
  const claimKnown = (address: string) =>
    priorClaims.has(address) || createdClaims.has(address);
  const obligationKnown = (address: string) =>
    priorObligations.has(address) || createdObligations.has(address);
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
  const newObligations: ObligationRecord[] = [];

  for (const { entry, address } of addressed) {
    const [route, payload] = entry;
    if (route === "claim/create") {
      const entities = payload.entities.map(resolveReference);
      for (const reference of entities)
        if (!entityKnown(reference))
          return refusal(`Unknown entity ${reference}.`);
      const supersedes = (payload.supersedes ?? []).map(resolveReference);
      for (const reference of supersedes) {
        if (!claimKnown(reference))
          return refusal(`Unknown claim ${reference}.`);
        if (
          !priorClaims.has(reference) &&
          !newClaims.some((claim) => claim.address === reference)
        )
          return refusal(
            `Claim ${address} cannot supersede ${reference}; supersedes names an earlier claim.`,
          );
      }
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
      const discharges = (payload.discharges ?? []).map(resolveReference);
      for (const reference of discharges)
        if (!obligationKnown(reference))
          return refusal(`Unknown obligation ${reference}.`);
      newReflections.push({
        address,
        text: payload.text,
        ...(payload.netElements === undefined
          ? {}
          : { netElements: payload.netElements }),
        ...(claims.length > 0 ? { claims } : {}),
        ...(entities.length > 0 ? { entities } : {}),
        ...(discharges.length > 0 ? { discharges } : {}),
        turn,
      });
    } else if (route === "obligation/create") {
      const claims = (payload.claims ?? []).map(resolveReference);
      for (const reference of claims)
        if (!claimKnown(reference))
          return refusal(`Unknown claim ${reference}.`);
      const entities = (payload.entities ?? []).map(resolveReference);
      for (const reference of entities)
        if (!entityKnown(reference))
          return refusal(`Unknown entity ${reference}.`);
      newObligations.push({
        address,
        text: payload.text,
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
        const prior = priorEntities.get(address);
        if (!prior)
          return refusal(
            `Unknown entity ${address}; entity/update addresses an existing record.`,
          );
        // The entity keeps the turn it was created in; the log keeps the update's.
        entityUpdates.set(address, { ...record, turn: prior.turn });
      }
    }
  }

  const turns =
    anchor !== undefined &&
    !state.turns.some((existing) => existing.id === anchor.id)
      ? [...state.turns, anchor]
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
      obligations: [...state.obligations, ...newObligations],
    },
  };
};

export interface FoldedLedger {
  readonly state: LedgerState;
  readonly commits: readonly AcceptedCommit[];
  readonly revision: number;
  /** Calls whose receipt says recorded but which the fold rejects, in order. */
  readonly rejected: readonly string[];
}

const foldWithReservations = (
  history: LedgerHistory,
  before?: string,
): FoldedLedger & { readonly reserved: AddressCounters } => {
  let state = emptyState();
  let reserved = noReservedAddresses;
  const commits: AcceptedCommit[] = [];
  const rejected: string[] = [];
  for (const call of ledgerCalls(history)) {
    if (call.part.toolCallId === before) break;
    if (call.part.state !== "output-available") continue;
    const output = v.safeParse(ledgerAppendOutputSchema, call.part.output);
    if (!output.success) continue;
    const recorded = output.output;
    if (
      recorded.status !== "recorded" ||
      recorded.commitId !== call.part.toolCallId
    )
      continue;
    const input = v.safeParse(vLedgerAppend, call.part.input);
    const derived = input.success
      ? deriveBatch(state, input.output.entries, call.turn, reserved)
      : undefined;
    const derivedIds =
      derived === undefined || "refusal" in derived ? undefined : derived.ids;
    const agrees =
      derivedIds !== undefined &&
      recorded.ids.length === derivedIds.length &&
      derivedIds.every((id, index) => recorded.ids[index] === id);
    if (!agrees || derived === undefined || "refusal" in derived) {
      rejected.push(call.part.toolCallId);
      reserved = reserveAddresses(countersOf(state, reserved), [
        ...(derivedIds ?? []),
        ...recorded.ids,
      ]);
      continue;
    }
    commits.push({
      commitId: call.part.toolCallId,
      revision: commits.length + 1,
      ...(call.turn === undefined ? {} : { afterMessageId: call.turn.id }),
      ids: derived.ids,
    });
    state = derived.state;
  }
  return { state, commits, revision: commits.length, rejected, reserved };
};

/**
 * Fold accepted commits in canonical order. A call counts only when its
 * recorded input and successful output agree on the call identity and on the
 * IDs the input yields after the commits before it. Pending, refused, failed
 * and malformed calls contribute nothing. A call whose receipt says recorded
 * but which the fold rejects adds no records, but keeps the IDs it occupied
 * reserved, so later commits still fold and no ID is issued twice. `before`
 * stops at the named call without including it.
 */
export const foldCommits = (
  history: LedgerHistory,
  before?: string,
): FoldedLedger => {
  const { state, commits, revision, rejected } = foldWithReservations(
    history,
    before,
  );
  return { state, commits, revision, rejected };
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
  if (own === undefined)
    throw new Error(
      `Conversation history does not contain ledger_commit ${call.toolCallId}.`,
    );
  const { state, revision, reserved } = foldWithReservations(
    call.history,
    call.toolCallId,
  );
  if (own.followsUnsettledCall)
    return {
      status: "refused",
      applied: false,
      code: "concurrent-commit",
      message:
        "An earlier ledger_commit in this response has not settled; wait for its result.",
      revision,
    };
  const unshownClaim = claimWithoutEntity(call.entries);
  if (unshownClaim !== undefined)
    return {
      status: "refused",
      applied: false,
      code: "claim-without-entity",
      message: unshownClaim,
      revision,
    };
  const derived = deriveBatch(state, call.entries, own.turn, reserved);
  if ("refusal" in derived)
    return {
      status: "refused",
      applied: false,
      code: derived.refusal.code,
      message: derived.refusal.message,
      revision,
    };
  const owed = owedObligations(derived.state).map(({ address, text }) => ({
    id: address,
    text,
  }));
  const notes = accountDisplacements(derived.state, derived.ids);
  return {
    status: "recorded",
    commitId: call.toolCallId,
    revision: revision + 1,
    ids: derived.ids,
    exchanges: exchangesThrough(call.history, own.turn?.id),
    openQuestions: projectLedger(derived.state).questions.length,
    ...(owed.length > 0 ? { owed } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
};

const exchangesThrough = (
  history: LedgerHistory,
  messageId: string | undefined,
): number => {
  if (messageId === undefined) return 0;
  const end = history.messages.findIndex(({ id }) => id === messageId);
  return history.messages.slice(0, end + 1).filter(isUserMessage).length;
};

const accountOrigins: ReadonlySet<Origin> = new Set(["stated", "evidenced"]);

/** A claim of the agent's own superseding the account: the account leaves the map. */
const accountDisplacements = (
  state: LedgerState,
  createdIds: readonly string[],
): string[] => {
  const byAddress = new Map(
    state.claims.map((claim) => [claim.address, claim]),
  );
  return createdIds.flatMap((address) => {
    const claim = byAddress.get(address);
    if (claim === undefined || accountOrigins.has(claim.origin)) return [];
    return (claim.supersedes ?? []).flatMap((target) => {
      const earlier = byAddress.get(target);
      return earlier !== undefined && accountOrigins.has(earlier.origin)
        ? [
            `${address} (${claim.origin}) supersedes ${target} (${earlier.origin}), so the account's claim leaves the current map. Supersede it only for a correction the USER made; if both hold, record them as separate claims, each with its selecting condition.`,
          ]
        : [];
    });
  });
};
