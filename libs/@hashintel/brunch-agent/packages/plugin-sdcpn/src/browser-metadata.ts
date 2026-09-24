export const canonicalContent = (value: unknown): string | undefined => {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (typeof entry === "object" && entry !== null)
      return Object.fromEntries(
        Object.entries(entry)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    return entry;
  };
  return JSON.stringify(normalize(value));
};

export interface BrowserBinding {
  readonly documentId: string;
  readonly incarnationId: string;
  readonly conversationId: string;
}

/** Host-only context; the canonical Petrinaut output is unchanged. */
export interface ClientToolResultMetadata {
  readonly documentRevision: {
    readonly before?: string;
    readonly after?: string;
  };
}

export const parseClientToolResultMetadata = (
  value: unknown,
): ClientToolResultMetadata | undefined => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("documentRevision" in value)
  )
    return undefined;
  const revision = value.documentRevision;
  if (typeof revision !== "object" || revision === null) return undefined;
  const fields = revision as Record<string, unknown>;
  return {
    documentRevision: {
      ...(typeof fields.before === "string" ? { before: fields.before } : {}),
      ...(typeof fields.after === "string" ? { after: fields.after } : {}),
    },
  };
};
