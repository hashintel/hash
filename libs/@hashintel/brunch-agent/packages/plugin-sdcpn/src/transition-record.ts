import {
  mutationActionInputSchemas,
  parseSDCPNFile,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import type { PetrinautAiToolInput } from "@hashintel/petrinaut-core/ai";

/** First observation contract: the already-mounted, root-net addArc operation only. */
export type ArcMutationRequest = {
  toolCallId: string;
  toolName: "addArc" | "updateArcWeight";
  input: PetrinautAiToolInput<"addArc">;
  binding: {
    conversationId: string;
    documentId: string;
    incarnationId: string;
  };
  requestedBaseHash: string;
  /** Required only in the distinct conversation-bound mode; legacy history is unchanged. */
  observationToolCallId?: string;
};

export type DefinitionObservation = { definition: SDCPN; sha256: string };

/** Snapshot-relative JSON pointer. Values retain the entire changed subtree. */
export type DefinitionChange = {
  path: string;
} & (
  | { kind: "created"; after: unknown }
  | { kind: "updated"; before: unknown; after: unknown }
  | { kind: "deleted"; before: unknown }
);

export type ArcEffects = {
  created: DefinitionChange[];
  updated: DefinitionChange[];
  deleted: DefinitionChange[];
  /** Unmapped changes, NOT inherited basis or evidence of intended consequences. */
  derived: DefinitionChange[];
};

export type ArcTransitionAttempt = {
  request: ArcMutationRequest;
  binding: ArcMutationRequest["binding"];
  pre: DefinitionObservation;
  post?: DefinitionObservation;
  outcome: "applied" | "no-op" | "failed" | "stale" | "unknown";
  effects: ArcEffects;
  error?: string;
};

export type ArcTransitionRecord = {
  attempts: ArcTransitionAttempt[];
  outcome: ArcTransitionAttempt["outcome"];
};

const objectValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Equality ignores object insertion order, but never array order or canonical fields. */
export const canonicalContent = (value: unknown): string | undefined => {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (objectValue(entry)) {
      return Object.fromEntries(
        Object.keys(entry)
          .sort()
          .map((key) => [key, normalize(entry[key])]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
};

const definitionChanges = (
  before: unknown,
  after: unknown,
  path = "",
): DefinitionChange[] => {
  if (canonicalContent(before) === canonicalContent(after)) return [];
  if (before === undefined) return [{ path, kind: "created", after }];
  if (after === undefined) return [{ path, kind: "deleted", before }];
  if (
    (objectValue(before) && objectValue(after)) ||
    (Array.isArray(before) && Array.isArray(after))
  ) {
    const previous = before as Record<string, unknown>;
    const next = after as Record<string, unknown>;
    return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
      .sort()
      .flatMap((key) =>
        definitionChanges(
          previous[key],
          next[key],
          `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        ),
      );
  }
  return [{ path, kind: "updated", before, after }];
};

/** No operation portfolio: only identify the requested root arc; everything else stays unmapped. */
export const deriveArcEffects = (
  request: ArcMutationRequest,
  pre: SDCPN,
  post: SDCPN,
): ArcEffects => {
  const input = mutationActionInputSchemas[request.toolName].parse(
    request.input,
  );
  if (input.targetSubnetId || typeof input.placeId !== "string") {
    throw new Error("Transition observation supports root place arcs only.");
  }
  const transitionIndex = pre.transitions.findIndex(
    (transition) => transition.id === input.transitionId,
  );
  const transition = post.transitions[transitionIndex];
  const direction = input.arcDirection === "input" ? "inputArcs" : "outputArcs";
  const arcIndex =
    transition?.id === input.transitionId
      ? transition[direction].findIndex(
          (arc) => "placeId" in arc && arc.placeId === input.placeId,
        )
      : -1;
  const arcPath = `/transitions/${transitionIndex}/${direction}/${arcIndex}`;
  const effects: ArcEffects = {
    created: [],
    updated: [],
    deleted: [],
    derived: [],
  };
  // JSON normalization removes optional undefined object properties before diffing.
  for (const change of definitionChanges(
    JSON.parse(JSON.stringify(pre)),
    JSON.parse(JSON.stringify(post)),
  )) {
    const direct =
      transitionIndex >= 0 &&
      arcIndex >= 0 &&
      (change.path === arcPath || change.path.startsWith(`${arcPath}/`));
    effects[direct ? change.kind : "derived"].push(change);
  }
  return effects;
};

export const assertArcEffects = (attempt: ArcTransitionAttempt): void => {
  const expected = attempt.post
    ? deriveArcEffects(
        attempt.request,
        attempt.pre.definition,
        attempt.post.definition,
      )
    : { created: [], updated: [], deleted: [], derived: [] };
  if (canonicalContent(expected) !== canonicalContent(attempt.effects)) {
    throw new Error(
      "Transition effects do not account for the complete canonical diff.",
    );
  }
};

/** Only the expected root-arc insertion earns an applied result in this first contract. */
export const observedArcOutcome = (
  attempt: Omit<ArcTransitionAttempt, "outcome">,
): ArcTransitionAttempt["outcome"] => {
  if (!attempt.post) return "unknown";
  const unchanged =
    canonicalContent(attempt.pre.definition) ===
    canonicalContent(attempt.post.definition);
  if (attempt.error !== undefined) return unchanged ? "failed" : "unknown";
  if (
    canonicalContent(attempt.request.binding) !==
    canonicalContent(attempt.binding)
  )
    return "unknown";
  if (attempt.request.requestedBaseHash !== attempt.pre.sha256)
    return unchanged ? "stale" : "unknown";
  if (unchanged) return "no-op";
  const effects = attempt.effects;
  if (attempt.request.toolName === "updateArcWeight") {
    const change = effects.updated[0];
    const input = mutationActionInputSchemas.updateArcWeight.parse(
      attempt.request.input,
    );
    return effects.derived.length === 0 &&
      effects.created.length === 0 &&
      effects.deleted.length === 0 &&
      effects.updated.length === 1 &&
      change?.kind === "updated" &&
      change.path.endsWith("/weight") &&
      change.after === input.weight
      ? "applied"
      : "unknown";
  }
  if (
    effects.derived.length ||
    effects.updated.length ||
    effects.deleted.length ||
    effects.created.length !== 1
  )
    return "unknown";
  const {
    transitionId: _transitionId,
    targetSubnetId: _targetSubnetId,
    arcDirection,
    type,
    ...endpointAndWeight
  } = mutationActionInputSchemas.addArc.parse(attempt.request.input);
  const expectedArc = {
    ...endpointAndWeight,
    ...(arcDirection === "input" ? { type: type ?? "standard" } : {}),
  };
  const created = effects.created[0];
  return created?.kind === "created" &&
    canonicalContent(created.after) === canonicalContent(expectedArc)
    ? "applied"
    : "unknown";
};

export const verifyDefinitionObservation = async (
  observation: DefinitionObservation,
): Promise<DefinitionObservation> => {
  const detached = structuredClone(observation);
  const parsed = parseSDCPNFile({
    ...detached.definition,
    title: "Browser observation",
  });
  if (!parsed.ok)
    throw new Error(`Invalid canonical observation: ${parsed.error}`);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(detached.definition)),
  );
  const actual = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (actual !== detached.sha256)
    throw new Error(
      "Transition observation hash does not match its definition.",
    );
  return detached;
};

/** Reconciliation only: never an alias or relaxation of mutation/base checks. */
export const reconcileDefinitionObservations = async (
  recorded: DefinitionObservation,
  observed: DefinitionObservation,
) => {
  if (
    !objectValue(recorded) ||
    !objectValue(observed) ||
    !objectValue(recorded.definition) ||
    !objectValue(observed.definition)
  )
    throw new Error("Reconciliation requires both full observations.");
  const [verifiedRecord, verifiedObservation] = await Promise.all([
    verifyDefinitionObservation(recorded),
    verifyDefinitionObservation(observed),
  ]);
  return {
    status:
      canonicalContent(verifiedRecord.definition) !==
      canonicalContent(verifiedObservation.definition)
        ? ("different" as const)
        : verifiedRecord.sha256 === verifiedObservation.sha256
          ? ("hash-equal" as const)
          : ("serialization-equivalent" as const),
    recordedSha256: verifiedRecord.sha256,
    observedSha256: verifiedObservation.sha256,
  };
};

/** Recompute observation hashes at a receiving boundary, not from the request's base. */
export const verifyArcTransitionAttempt = async (
  delivery: ArcTransitionAttempt,
): Promise<ArcTransitionAttempt> => {
  // Validate a detached delivery: callers cannot change the content while hashes settle.
  const attempt = structuredClone(delivery);
  if (
    !["addArc", "updateArcWeight"].includes(attempt.request.toolName) ||
    !/^[a-f0-9]{64}$/u.test(attempt.request.requestedBaseHash) ||
    [
      attempt.request.toolCallId,
      ...Object.values(attempt.request.binding),
      ...Object.values(attempt.binding),
    ].some((value) => typeof value !== "string" || value.trim().length === 0)
  ) {
    throw new Error("Malformed arc transition identity.");
  }
  deriveArcEffects(
    attempt.request,
    attempt.pre.definition,
    attempt.pre.definition,
  );
  await Promise.all(
    [attempt.pre, attempt.post].map(async (observation) => {
      if (!observation) return;
      await verifyDefinitionObservation(observation);
    }),
  );
  assertArcEffects(attempt);
  if (
    attempt.outcome !== "unknown" &&
    attempt.outcome !== observedArcOutcome(attempt)
  ) {
    throw new Error(
      "The transition outcome is not supported by its observations.",
    );
  }
  return attempt;
};

/** Inputs must first pass verifyArcTransitionAttempt at an external receiving boundary. */
export const reconcileArcTransitionAttempts = (
  attempts: ArcTransitionAttempt[],
): ArcTransitionRecord => {
  const first = attempts[0];
  if (!first) throw new Error("A transition record requires an attempt.");
  if (
    attempts.some(
      (attempt) => attempt.request.toolCallId !== first.request.toolCallId,
    )
  ) {
    throw new Error("Cannot reconcile different tool calls.");
  }
  return {
    attempts: structuredClone(attempts),
    outcome: attempts.some(
      (attempt) => canonicalContent(attempt) !== canonicalContent(first),
    )
      ? "unknown"
      : first.outcome,
  };
};
