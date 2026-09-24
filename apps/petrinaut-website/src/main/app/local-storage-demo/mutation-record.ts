import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
  classifyMutationOutcome,
  deriveMutationEffects,
  type ConstructionMutationRequest,
  type HostRecordedCanonicalMutationName,
  type MutationEffects,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  getLatestNetDefinitionToolName,
  type DocumentRevisionId,
  type PetrinautAiToolInput,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut-core";

export interface BrowserToolBinding {
  readonly documentId: string;
  readonly incarnationId: string;
  readonly conversationId: string;
}

export interface BrowserDefinitionObservation {
  readonly definition: SDCPN;
  readonly sha256: string;
  readonly revisionId: DocumentRevisionId;
}

/** The plugin owns this list so the server demands records for exactly these names. */
export type CanonicalBrowserMutationName = HostRecordedCanonicalMutationName;

export type CanonicalMutationOutcome =
  | "applied"
  | "no-op"
  | "failed"
  | "unknown";

export type BrowserDiagnosticsRecord =
  | { readonly status: "not-required" }
  | { readonly status: "pending" }
  | { readonly status: "settled"; readonly value: string }
  | { readonly status: "failed"; readonly error: string };

export type BrowserSettlementRecord =
  | { readonly status: "not-required" }
  | { readonly status: "pending"; readonly revisionId: DocumentRevisionId }
  | { readonly status: "settled"; readonly revisionId: DocumentRevisionId }
  | {
      readonly status: "failed";
      readonly revisionId: DocumentRevisionId;
      readonly error: string;
    };

type BrowserMutationRecordFor<Name extends CanonicalBrowserMutationName> = {
  readonly toolCallId: string;
  readonly toolName: Name;
  readonly input: PetrinautAiToolInput<Name>;
  readonly binding: BrowserToolBinding;
  readonly pre?: BrowserDefinitionObservation;
  readonly post?: BrowserDefinitionObservation;
  readonly outcome?: CanonicalMutationOutcome;
  /** Why classification could not earn a definite outcome, when it says so. */
  readonly outcomeReason?: string;
  readonly effects?: MutationEffects;
  readonly settlement: BrowserSettlementRecord;
  readonly diagnostics: BrowserDiagnosticsRecord;
  readonly output?: unknown;
  readonly error?: string;
};

export type BrowserCanonicalMutationRecord = {
  [Name in CanonicalBrowserMutationName]: BrowserMutationRecordFor<Name>;
}[CanonicalBrowserMutationName];

/** Retained for callers that specifically narrow addPlace records. */
export type BrowserAddPlaceRecord = Extract<
  BrowserCanonicalMutationRecord,
  { readonly toolName: "addPlace" }
>;

export interface BrowserReadRecord {
  readonly toolCallId: string;
  readonly toolName: typeof getLatestNetDefinitionToolName;
  readonly binding: BrowserToolBinding;
  readonly observation: BrowserDefinitionObservation;
}

export type BrowserToolRecord =
  | BrowserCanonicalMutationRecord
  | BrowserReadRecord;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Observe the bound live handle, never a request or rendered snapshot. */
export const observeBrowserDefinition = (
  handle: PetrinautDocHandle,
): BrowserDefinitionObservation => {
  const live = handle.doc();
  if (!live) throw new Error("The bound browser document is unavailable.");
  const definition = structuredClone(live);
  return {
    definition,
    sha256: bytesToHex(
      sha256(new TextEncoder().encode(JSON.stringify(definition))),
    ),
    revisionId: handle.revisionId.get(),
  };
};

/** Plugin-owned complete diff partition plus the browser-observed outcome. */
export const deriveCanonicalMutationEvidence = <
  Name extends CanonicalBrowserMutationName,
>({
  toolName,
  input,
  pre,
  post,
}: {
  toolName: Name;
  input: PetrinautAiToolInput<Name>;
  pre: BrowserDefinitionObservation;
  post: BrowserDefinitionObservation;
}): {
  outcome: CanonicalMutationOutcome;
  outcomeReason?: string;
  effects: MutationEffects;
} => {
  const binding = {
    documentId: "browser-observation",
    incarnationId: "browser-observation",
    conversationId: "browser-observation",
  };
  const request = {
    toolCallId: "browser-observation",
    toolName,
    input,
    binding,
    requestedBaseHash: pre.sha256,
  } as ConstructionMutationRequest;
  const effects = deriveMutationEffects(
    request,
    pre.definition,
    post.definition,
  );
  const unchanged = pre.sha256 === post.sha256;
  const classified = classifyMutationOutcome({
    request,
    binding,
    pre,
    post,
    effects,
  });
  return {
    outcome: unchanged
      ? "no-op"
      : classified.outcome === "stale"
        ? "unknown"
        : classified.outcome,
    ...(unchanged || classified.reason === undefined
      ? {}
      : { outcomeReason: classified.reason }),
    effects,
  };
};

export const deriveAddPlaceEvidence = (
  input: Omit<
    Parameters<typeof deriveCanonicalMutationEvidence<"addPlace">>[0],
    "toolName"
  >,
) => deriveCanonicalMutationEvidence({ toolName: "addPlace", ...input });

/** Host-only retained records for one immutable document incarnation/conversation. */
export const createBrowserMutationRecords = ({
  handle,
  suppliedBinding,
}: {
  handle: PetrinautDocHandle;
  suppliedBinding: BrowserToolBinding;
}) => {
  const binding = structuredClone(suppliedBinding);
  if (binding.documentId !== handle.id)
    throw new Error("The browser binding does not match the live document.");

  const records = new Map<string, BrowserToolRecord>();

  const read = (toolCallId: string) => records.get(toolCallId);
  const retain = (record: BrowserToolRecord) => {
    if (
      record.binding.documentId !== binding.documentId ||
      record.binding.incarnationId !== binding.incarnationId ||
      record.binding.conversationId !== binding.conversationId
    ) {
      throw new Error("A browser record belongs to another binding.");
    }
    records.set(record.toolCallId, structuredClone(record));
  };

  return {
    binding,
    read,
    retain,
    records: () =>
      [...records.values()].map((record) => structuredClone(record)),
    metadataFor: (toolCallId: string) => {
      const record = read(toolCallId);
      return record === undefined ? undefined : structuredClone(record);
    },
    errorMessage,
  };
};
