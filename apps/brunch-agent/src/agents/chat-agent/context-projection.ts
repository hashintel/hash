import {
  isMutatePetrinautNetToolName,
  isReadPetrinautNetToolName,
  layoutPetrinautNetToolName,
  mutatePetrinetOutputSchema,
  parseClientToolResultMetadata,
  readPetrinautDiagnosticsToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
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

type AuthoritativeContent = {
  entryIndex: number;
  entryId: string;
  revisionId: string;
  sha256: string;
  target: "mutation" | "read";
};

const authoritativeContent = (
  entry: ContextProjectionEntry,
  entryIndex: number,
): AuthoritativeContent | undefined => {
  const { message } = entry;
  if (message.role !== "toolResult") return undefined;
  const output = parseTextJson(message);
  if (!output) return undefined;
  const candidate =
    message.toolName === "mutate_workpiece"
      ? output
      : message.toolName === "read_workpiece" &&
          isRecord(output.currentWorkpiece)
        ? output.currentWorkpiece
        : undefined;
  if (
    !candidate ||
    typeof candidate.revisionId !== "string" ||
    typeof candidate.sha256 !== "string" ||
    typeof candidate.markdown !== "string"
  )
    return undefined;
  return {
    entryIndex,
    entryId: entry.id,
    revisionId: candidate.revisionId,
    sha256: candidate.sha256,
    target: message.toolName === "mutate_workpiece" ? "mutation" : "read",
  };
};

const contentKey = (
  content: Pick<AuthoritativeContent, "revisionId" | "sha256">,
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
  content: AuthoritativeContent,
  retainedEntryId: string,
) => ({
  revisionId: content.revisionId,
  sha256: content.sha256,
  retainedEntryId,
});

const compactWorkpieceResult = (
  entry: ContextProjectionEntry,
  content: AuthoritativeContent,
  retainedEntryId: string,
): ContextProjectionEntry => {
  const output = parseTextJson(entry.message);
  if (!output) return entry;
  if (content.target === "mutation") {
    const { markdown: _markdown, ...pointer } = output;
    return {
      ...entry,
      message: withTextJson(entry.message, {
        ...pointer,
        markdownReference: contentReference(content, retainedEntryId),
      }),
    };
  }
  if (!isRecord(output.currentWorkpiece)) return entry;
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

const markRetainedWorkpieceResult = (
  entry: ContextProjectionEntry,
  content: AuthoritativeContent,
): ContextProjectionEntry => {
  const output = parseTextJson(entry.message);
  if (!output) return entry;
  const identity = {
    entryId: entry.id,
    revisionId: content.revisionId,
    sha256: content.sha256,
  };
  if (content.target === "mutation")
    return {
      ...entry,
      message: withTextJson(entry.message, {
        markdownIdentity: identity,
        ...output,
      }),
    };
  if (!isRecord(output.currentWorkpiece)) return entry;
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
};

const compactObservation = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  const { definition: _definition, ...pointer } = value;
  return pointer;
};

const compactMutationAttempt = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  return {
    ...value,
    pre: compactObservation(value.pre),
    ...(value.post === undefined
      ? {}
      : { post: compactObservation(value.post) }),
  };
};

const compactMetadata = (metadata: unknown): unknown => {
  const parsed = parseClientToolResultMetadata(metadata);
  if (!parsed) return metadata;
  return {
    ...parsed,
    ...(parsed.observation
      ? {
          observation: {
            ...parsed.observation,
            observed: compactObservation(parsed.observation.observed),
          },
        }
      : {}),
    ...(parsed.mutationRecord
      ? {
          mutationRecord: {
            ...parsed.mutationRecord,
            attempts: parsed.mutationRecord.attempts.map(
              compactMutationAttempt,
            ),
          },
        }
      : {}),
    ...(parsed.layoutRecord
      ? {
          layoutRecord: {
            ...parsed.layoutRecord,
            pre: compactObservation(parsed.layoutRecord.pre),
            post: compactObservation(parsed.layoutRecord.post),
          },
        }
      : {}),
  };
};

const projectsClientResult = (toolName: string, output: unknown): boolean =>
  (isMutatePetrinautNetToolName(toolName) &&
    mutatePetrinetOutputSchema.safeParse(output).success) ||
  isReadPetrinautNetToolName(toolName) ||
  toolName === readPetrinautDiagnosticsToolName ||
  toolName === layoutPetrinautNetToolName;

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
  if (!Array.isArray(raw) || !raw.every(isClientToolResult)) return entry;
  const projected = raw.map((result) =>
    projectsClientResult(result.toolName, result.output)
      ? { ...result, metadata: compactMetadata(result.metadata) }
      : result,
  );
  return {
    ...entry,
    message: { ...message, content: JSON.stringify(projected) },
  };
};

/**
 * Brunch's model-only projection. Every invocation decides content
 * availability from exactly the entries it receives.
 */
export const projectBrunchContext: ContextProjection = (entries) => {
  const authorities = entries.flatMap((entry, entryIndex) => {
    const content = authoritativeContent(entry, entryIndex);
    return content ? [content] : [];
  });
  const retainedEntryIds = new Map<string, string>();
  for (const content of authorities) {
    const key = contentKey(content);
    if (!retainedEntryIds.has(key)) retainedEntryIds.set(key, content.entryId);
  }

  return entries.map((entry, entryIndex) => {
    const authority = authorities.find(
      (candidate) => candidate.entryIndex === entryIndex,
    );
    const retainedEntryId = authority
      ? retainedEntryIds.get(contentKey(authority))
      : undefined;
    const projected =
      authority && retainedEntryId && retainedEntryId !== entry.id
        ? compactWorkpieceResult(entry, authority, retainedEntryId)
        : authority && retainedEntryId
          ? markRetainedWorkpieceResult(entry, authority)
          : entry;
    return compactClientToolSignal(projected);
  });
};
