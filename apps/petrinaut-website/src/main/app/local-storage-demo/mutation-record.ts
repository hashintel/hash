import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
  classifyMutationOutcome,
  deriveMutationEffects,
  type ConstructionMutationRequest,
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

export interface BrowserAddPlaceRecord {
  readonly toolCallId: string;
  readonly toolName: "addPlace";
  readonly input: PetrinautAiToolInput<"addPlace">;
  readonly binding: BrowserToolBinding;
  readonly pre?: BrowserDefinitionObservation;
  readonly post?: BrowserDefinitionObservation;
  readonly outcome?: CanonicalMutationOutcome;
  readonly effects?: MutationEffects;
  readonly settlement: BrowserSettlementRecord;
  readonly diagnostics: BrowserDiagnosticsRecord;
  readonly output?: unknown;
  readonly error?: string;
}

export interface BrowserReadRecord {
  readonly toolCallId: string;
  readonly toolName: typeof getLatestNetDefinitionToolName;
  readonly binding: BrowserToolBinding;
  readonly observation: BrowserDefinitionObservation;
}

export type BrowserToolRecord = BrowserAddPlaceRecord | BrowserReadRecord;

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
export const deriveAddPlaceEvidence = ({
  input,
  pre,
  post,
}: {
  input: PetrinautAiToolInput<"addPlace">;
  pre: BrowserDefinitionObservation;
  post: BrowserDefinitionObservation;
}): {
  outcome: CanonicalMutationOutcome;
  effects: MutationEffects;
} => {
  const binding = {
    documentId: "browser-observation",
    incarnationId: "browser-observation",
    conversationId: "browser-observation",
  };
  const request: ConstructionMutationRequest = {
    toolCallId: "browser-observation",
    toolName: "addPlace",
    input,
    binding,
    requestedBaseHash: pre.sha256,
  };
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
  }).outcome;
  return {
    outcome: unchanged
      ? "no-op"
      : classified === "stale"
        ? "unknown"
        : classified,
    effects,
  };
};

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
