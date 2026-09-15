import { createHash } from "node:crypto";

import {
  CLIENT_TOOL_RESULT_SIGNAL,
  isClientToolResult,
} from "@hashintel/brunch-agent-transport-aisdk";

import type {
  ContextProjection,
  ContextProjectionEntry,
  ContextProjectionMessage,
} from "@flue/runtime";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseTextJson = (
  message: ContextProjectionMessage,
): Record<string, unknown> | undefined => {
  if (message.role !== "toolResult" || message.isError) return undefined;
  const text = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

type SettlementAuthority = {
  callEntryIndex: number;
  callEntryId: string;
  resultEntryIndex: number;
  toolCallId: string;
  revisionId: string;
  sha256: string;
  markdown: string;
};

type ReadAuthority = {
  entryIndex: number;
  entryId: string;
  revisionId: string;
  sha256: string;
};

const sha256 = (markdown: string): string =>
  createHash("sha256").update(markdown, "utf8").digest("hex");

const settlementAuthorities = (
  entries: readonly ContextProjectionEntry[],
): SettlementAuthority[] => {
  const calls = entries.flatMap((entry, entryIndex) => {
    if (entry.message.role !== "assistant") return [];
    return entry.message.content.flatMap((part) => {
      if (
        part.type !== "toolCall" ||
        part.name !== "mutate_workpiece" ||
        !isRecord(part.arguments) ||
        typeof part.arguments.markdown !== "string"
      )
        return [];
      return [
        {
          callEntryIndex: entryIndex,
          callEntryId: entry.id,
          toolCallId: part.id,
          markdown: part.arguments.markdown,
        },
      ];
    });
  });

  return entries.flatMap((entry, resultEntryIndex) => {
    const { message } = entry;
    if (
      message.role !== "toolResult" ||
      message.toolName !== "mutate_workpiece" ||
      message.isError
    )
      return [];
    const output = parseTextJson(message);
    if (!output) return [];
    const matchingCalls = calls.filter(
      (call) => call.toolCallId === message.toolCallId,
    );
    const call = matchingCalls.length === 1 ? matchingCalls[0] : undefined;
    if (
      !call ||
      call.callEntryIndex >= resultEntryIndex ||
      typeof output.revisionId !== "string" ||
      output.revisionId !== message.toolCallId ||
      typeof output.sha256 !== "string" ||
      output.sha256 !== sha256(call.markdown)
    )
      return [];
    return [
      {
        ...call,
        resultEntryIndex,
        revisionId: output.revisionId,
        sha256: output.sha256,
      },
    ];
  });
};

const readAuthority = (
  entry: ContextProjectionEntry,
  entryIndex: number,
): ReadAuthority | undefined => {
  const { message } = entry;
  if (message.role !== "toolResult" || message.toolName !== "read_workpiece")
    return undefined;
  const output = parseTextJson(message);
  const candidate =
    output && isRecord(output.currentWorkpiece)
      ? output.currentWorkpiece
      : undefined;
  if (
    !candidate ||
    typeof candidate.revisionId !== "string" ||
    typeof candidate.sha256 !== "string" ||
    typeof candidate.markdown !== "string" ||
    candidate.sha256 !== sha256(candidate.markdown)
  )
    return undefined;
  return {
    entryIndex,
    entryId: entry.id,
    revisionId: candidate.revisionId,
    sha256: candidate.sha256,
  };
};

const contentKey = (
  content: Pick<SettlementAuthority | ReadAuthority, "revisionId" | "sha256">,
) => `${content.revisionId}\u0000${content.sha256}`;

const withTextJson = (
  message: ContextProjectionMessage,
  output: Record<string, unknown>,
): ContextProjectionMessage => {
  if (message.role !== "toolResult") return message;
  return {
    ...message,
    content: [{ type: "text", text: JSON.stringify(output) }],
  };
};

const contentReference = (
  content: Pick<SettlementAuthority | ReadAuthority, "revisionId" | "sha256">,
  retainedEntryId: string,
) => ({
  revisionId: content.revisionId,
  sha256: content.sha256,
  retainedEntryId,
});

const projectMutationResult = (
  entry: ContextProjectionEntry,
  authority: SettlementAuthority,
): ContextProjectionEntry => {
  const output = parseTextJson(entry.message);
  if (!output) return entry;
  const { markdown: _markdown, ...pointer } = output;
  return {
    ...entry,
    message: withTextJson(entry.message, {
      ...pointer,
      markdownReference: contentReference(authority, authority.callEntryId),
    }),
  };
};

const projectReadResult = (
  entry: ContextProjectionEntry,
  content: ReadAuthority,
  retainedEntryId: string,
): ContextProjectionEntry => {
  const output = parseTextJson(entry.message);
  if (!output || !isRecord(output.currentWorkpiece)) return entry;
  if (retainedEntryId === entry.id) {
    const identity = {
      entryId: entry.id,
      revisionId: content.revisionId,
      sha256: content.sha256,
    };
    return {
      ...entry,
      message: withTextJson(entry.message, {
        ...output,
        currentWorkpiece: {
          markdownIdentity: identity,
          ...output.currentWorkpiece,
        },
      }),
    };
  }
  const { markdown: _markdown, ...pointer } = output.currentWorkpiece;
  return {
    ...entry,
    message: withTextJson(entry.message, {
      ...output,
      currentWorkpiece: {
        ...pointer,
        markdownReference: contentReference(content, retainedEntryId),
      },
    }),
  };
};

const compactToolCallArguments = (
  entry: ContextProjectionEntry,
  entryIndex: number,
  authorities: readonly SettlementAuthority[],
  latestAuthority: SettlementAuthority | undefined,
): ContextProjectionEntry => {
  if (entry.message.role !== "assistant") return entry;
  const content = entry.message.content.map((part) => {
    if (
      part.type !== "toolCall" ||
      !isRecord(part.arguments) ||
      typeof part.arguments.markdown !== "string"
    )
      return part;
    const markdown = part.arguments.markdown;
    const authority =
      part.name === "mutate_workpiece"
        ? authorities.find(
            (candidate) =>
              candidate.callEntryId === entry.id &&
              candidate.toolCallId === part.id,
          )
        : part.name === "read_workpiece"
          ? authorities
              .filter(
                (candidate) =>
                  candidate.sha256 === sha256(markdown) &&
                  candidate.callEntryIndex > entryIndex,
              )
              .toSorted(
                (left, right) => left.callEntryIndex - right.callEntryIndex,
              )[0]
          : undefined;
    const shouldCompact =
      authority !== undefined &&
      (part.name === "read_workpiece" ||
        authority.toolCallId !== latestAuthority?.toolCallId);
    if (!shouldCompact) return part;
    const { markdown: _markdown, ...argumentsWithoutMarkdown } = part.arguments;
    return {
      ...part,
      arguments: {
        ...argumentsWithoutMarkdown,
        revisionId: authority.revisionId,
        sha256: authority.sha256,
        length: markdown.length,
        markdownReference: contentReference(authority, authority.callEntryId),
      },
    };
  });
  return {
    ...entry,
    message: { ...entry.message, content },
  };
};

const compactClientToolSignal = (
  entry: ContextProjectionEntry,
): ContextProjectionEntry => {
  const message = entry.message;
  if (
    message.role !== "signal" ||
    message.type !== CLIENT_TOOL_RESULT_SIGNAL ||
    message.tagName !== CLIENT_TOOL_RESULT_SIGNAL
  )
    return entry;
  let raw: unknown;
  try {
    raw = JSON.parse(message.content);
  } catch {
    return entry;
  }
  if (!Array.isArray(raw)) return entry;
  const projected = raw.flatMap((member) => {
    if (!isClientToolResult(member)) return [];
    const { metadata: _metadata, ...result } = member;
    return [result];
  });
  return {
    ...entry,
    message: { ...message, content: JSON.stringify(projected) },
  };
};

export type BrunchContextProjectionOptions = {
  /**
   * Provider acceptance remains gated by WP-A.9. Canonical history is
   * unchanged regardless of this model-context-only option.
   */
  projectSupersededWorkpieceArguments?: boolean;
};

/**
 * Build Brunch's model-only projection. Every invocation decides authority
 * from exactly the entries it receives.
 */
export const createBrunchContextProjection = (
  options: BrunchContextProjectionOptions = {},
): ContextProjection => {
  return (entries) => {
    const settlements = settlementAuthorities(entries);
    const reads = entries.flatMap((entry, entryIndex) => {
      const content = readAuthority(entry, entryIndex);
      return content ? [content] : [];
    });
    const latestSettlement = settlements.toSorted(
      (left, right) => right.resultEntryIndex - left.resultEntryIndex,
    )[0];
    const retainedEntryIds = new Map<string, string>();
    for (const settlement of settlements) {
      const key = contentKey(settlement);
      if (!retainedEntryIds.has(key))
        retainedEntryIds.set(key, settlement.callEntryId);
    }
    for (const read of reads) {
      const key = contentKey(read);
      if (!retainedEntryIds.has(key)) retainedEntryIds.set(key, read.entryId);
    }

    return entries.map((entry, entryIndex) => {
      const withProjectedArguments =
        options.projectSupersededWorkpieceArguments === true
          ? compactToolCallArguments(
              entry,
              entryIndex,
              settlements,
              latestSettlement,
            )
          : entry;
      const settlement = settlements.find(
        (candidate) => candidate.resultEntryIndex === entryIndex,
      );
      if (settlement)
        return compactClientToolSignal(
          projectMutationResult(withProjectedArguments, settlement),
        );
      const read = reads.find(
        (candidate) => candidate.entryIndex === entryIndex,
      );
      const retainedEntryId = read
        ? retainedEntryIds.get(contentKey(read))
        : undefined;
      return compactClientToolSignal(
        read && retainedEntryId
          ? projectReadResult(withProjectedArguments, read, retainedEntryId)
          : withProjectedArguments,
      );
    });
  };
};

/** Argument projection stays default-off pending the bounded WP-A.9 probe. */
export const projectBrunchContext = createBrunchContextProjection();
