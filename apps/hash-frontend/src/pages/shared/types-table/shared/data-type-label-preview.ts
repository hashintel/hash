import type {
  DataType,
  DataTypeWithMetadata,
  SingleValueSchema,
  ValueLabel,
  VersionedUrl,
} from "@blockprotocol/type-system";

const resolveLabel = (
  schema: DataType,
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>,
): ValueLabel | null | undefined => {
  let level = [schema];
  const visited = new Set<VersionedUrl>();

  while (level.length) {
    const labels = level.flatMap(({ label }) =>
      label && (label.left !== undefined || label.right !== undefined)
        ? [label]
        : [],
    );
    const first = labels[0];
    if (first) {
      return labels.every(
        (label) => label.left === first.left && label.right === first.right,
      )
        ? first
        : null;
    }

    const parents: DataType[] = [];
    for (const current of level) {
      visited.add(current.$id);
      for (const { $ref } of current.allOf ?? []) {
        if (visited.has($ref)) {
          continue;
        }
        const parent = dataTypes[$ref];
        if (!parent) {
          return null;
        }
        parents.push(parent.schema);
        visited.add($ref);
      }
    }
    level = parents;
  }
  return undefined;
};

export type DataTypeLabelPart = {
  kind: "placeholder" | "label" | "punctuation";
  text: string;
};

const punctuation = (text: string): DataTypeLabelPart => ({
  kind: "punctuation",
  text,
});
const placeholder: DataTypeLabelPart = { kind: "placeholder", text: "value" };

// Bound schema-driven expansion before preview text reaches canvas, copy, or search.
const maxLabelCharacters = 64;
const maxPreviewCharacters = 256;
const maxTupleItems = 8;
const maxUnionOptions = 8;

const prefix = (text: string, length: number): string => {
  const last = text.charCodeAt(length - 1);
  const next = text.charCodeAt(length);
  const splitsSurrogate =
    last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
  return text.slice(0, splitsSurrogate ? length - 1 : length);
};

const normalizeLabelText = (text: string | undefined): string | undefined =>
  text === undefined
    ? undefined
    : (text.length > maxLabelCharacters
        ? `${prefix(text, maxLabelCharacters - 1)}…`
        : text
      ).replace(/\s+/gu, " ");

const limitPreview = (parts: DataTypeLabelPart[]): DataTypeLabelPart[] => {
  if (
    parts.reduce((length, { text }) => length + text.length, 0) <=
    maxPreviewCharacters
  ) {
    return parts;
  }
  const bounded: DataTypeLabelPart[] = [];
  let remaining = maxPreviewCharacters - 1;
  for (const part of parts) {
    if (part.text.length <= remaining) {
      bounded.push(part);
      remaining -= part.text.length;
    } else {
      const text = prefix(part.text, remaining);
      if (text) {
        bounded.push({ ...part, text });
      }
      break;
    }
  }
  return [...bounded, punctuation("…")];
};

const labelValue = (
  inner: DataTypeLabelPart[],
  label: ValueLabel | undefined,
  normalizedLabels: WeakMap<ValueLabel, ValueLabel>,
): DataTypeLabelPart[] => {
  let normalized: ValueLabel | undefined;
  if (label) {
    normalized = normalizedLabels.get(label);
    if (!normalized) {
      normalized = {
        left: normalizeLabelText(label.left),
        right: normalizeLabelText(label.right),
      };
      normalizedLabels.set(label, normalized);
    }
  }
  return limitPreview([
    ...(normalized?.left
      ? [{ kind: "label" as const, text: normalized.left }]
      : []),
    ...inner,
    ...(normalized?.right
      ? [punctuation(" "), { kind: "label" as const, text: normalized.right }]
      : []),
  ]);
};

const joinParts = (items: DataTypeLabelPart[][], separator: string) =>
  items.flatMap((item, index) =>
    index ? [punctuation(separator), ...item] : item,
  );

type ArraySchema = Extract<SingleValueSchema, { type: "array" }>;

const getInheritedArraySchemas = (
  schema: DataType,
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>,
): ArraySchema[][] => {
  const levels: ArraySchema[][] = [];
  const visited = new Set([schema.$id]);
  let references = schema.allOf ?? [];
  while (references.length) {
    const level: ArraySchema[] = [];
    const next: NonNullable<DataType["allOf"]> = [];
    for (const { $ref } of references) {
      if (visited.has($ref)) {
        continue;
      }
      visited.add($ref);
      const parent = dataTypes[$ref]?.schema;
      if (parent) {
        if ("type" in parent && parent.type === "array") {
          level.push(parent);
        }
        next.push(...(parent.allOf ?? []));
      }
    }
    levels.push(level);
    references = next;
  }
  return levels;
};

const previewValue = (
  schema: SingleValueSchema,
  inheritedArrays: ArraySchema[][],
  normalizedLabels: WeakMap<ValueLabel, ValueLabel>,
): DataTypeLabelPart[] => {
  if (schema.type !== "array") {
    return labelValue([placeholder], schema.label, normalizedLabels);
  }

  const levels = [[schema], ...inheritedArrays];
  const arrays = levels.flat();
  const tupleLength = arrays.reduce<number | undefined>(
    (length, array) =>
      array.items === false
        ? Math.max(length ?? 0, array.prefixItems?.length ?? 0)
        : length,
    undefined,
  );
  const maxItems = arrays.reduce(
    (maximum, array) =>
      array.items === false
        ? maximum
        : Math.min(maximum, array.maxItems ?? Infinity),
    Infinity,
  );
  const count =
    tupleLength === undefined
      ? Math.min(maxItems, 2)
      : Math.min(tupleLength, maxTupleItems);
  const items = Array.from({ length: count }, (_, index) => {
    const labels = levels
      .map((level) =>
        level.flatMap((array) => {
          const label = (
            array.items === false ? array.prefixItems?.[index] : array.items
          )?.label;
          return label &&
            (label.left !== undefined || label.right !== undefined)
            ? [label]
            : [];
        }),
      )
      .find((level) => level.length);
    const first = labels?.[0];
    const label = labels?.every(
      (candidate) =>
        candidate.left === first?.left && candidate.right === first?.right,
    )
      ? first
      : undefined;
    return labelValue([placeholder], label, normalizedLabels);
  });

  if ((tupleLength ?? maxItems) > count) {
    items.push([punctuation("…")]);
  }
  return labelValue(
    [punctuation("["), ...joinParts(items, ", "), punctuation("]")],
    schema.label,
    normalizedLabels,
  );
};

export const getDataTypeLabelPreview = (
  schema: DataType,
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>,
): DataTypeLabelPart[] | undefined => {
  const label = resolveLabel(schema, dataTypes) ?? undefined;
  const normalizedLabels = new WeakMap<ValueLabel, ValueLabel>();
  const unionOptions =
    "anyOf" in schema ? schema.anyOf.slice(0, maxUnionOptions) : [];
  const hasArray =
    "anyOf" in schema
      ? unionOptions.some(({ type }) => type === "array")
      : schema.type === "array";
  const inheritedArrays = hasArray
    ? getInheritedArraySchemas(schema, dataTypes)
    : [];

  let preview: DataTypeLabelPart[];
  if ("anyOf" in schema) {
    const options = unionOptions.map((option) =>
      previewValue(
        { ...option, label: option.label ?? label },
        inheritedArrays,
        normalizedLabels,
      ),
    );
    const formats = [
      ...new Map(
        options.map((parts) => [parts.map(({ text }) => text).join(""), parts]),
      ).values(),
    ];
    if (schema.anyOf.length > maxUnionOptions) {
      formats.push([punctuation("…")]);
    }
    preview =
      formats.length > 1
        ? limitPreview([
            punctuation("("),
            ...joinParts(formats, " | "),
            punctuation(")"),
          ])
        : (formats[0] ?? [placeholder]);
  } else {
    preview = previewValue(
      { ...schema, label },
      inheritedArrays,
      normalizedLabels,
    );
  }
  return preview.some(({ kind, text }) => kind === "label" && text.trim())
    ? preview
    : undefined;
};
