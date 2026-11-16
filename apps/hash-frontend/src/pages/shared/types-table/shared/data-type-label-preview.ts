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

const labelValue = (
  inner: DataTypeLabelPart[],
  label?: ValueLabel,
): DataTypeLabelPart[] => [
  ...(label?.left ? [{ kind: "label" as const, text: label.left }] : []),
  ...inner,
  ...(label?.right
    ? [punctuation(" "), { kind: "label" as const, text: label.right }]
    : []),
];

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
): DataTypeLabelPart[] => {
  if (schema.type !== "array") {
    return labelValue([placeholder], schema.label);
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
  const count = tupleLength ?? Math.min(maxItems, 2);
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
    return labelValue([placeholder], label);
  });

  if (tupleLength === undefined && maxItems > count) {
    items.push([punctuation("…")]);
  }
  return labelValue(
    [punctuation("["), ...joinParts(items, ", "), punctuation("]")],
    schema.label,
  );
};

export const getDataTypeLabelPreview = (
  schema: DataType,
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>,
): DataTypeLabelPart[] | undefined => {
  const label = resolveLabel(schema, dataTypes) ?? undefined;
  const hasArray =
    "anyOf" in schema
      ? schema.anyOf.some(({ type }) => type === "array")
      : schema.type === "array";
  const inheritedArrays = hasArray
    ? getInheritedArraySchemas(schema, dataTypes)
    : [];

  let preview: DataTypeLabelPart[];
  if ("anyOf" in schema) {
    const options = schema.anyOf.map((option) =>
      previewValue(option, inheritedArrays),
    );
    const formats = [
      ...new Map(
        options.map((parts) => [parts.map(({ text }) => text).join(""), parts]),
      ).values(),
    ];
    preview = labelValue(
      formats.length > 1
        ? [punctuation("("), ...joinParts(formats, " | "), punctuation(")")]
        : (formats[0] ?? [placeholder]),
      label,
    );
  } else {
    preview = previewValue({ ...schema, label }, inheritedArrays);
  }
  return preview.some(({ kind, text }) => kind === "label" && text.trim())
    ? preview.map((part) => ({
        ...part,
        text: part.text.replace(/\s+/gu, " "),
      }))
    : undefined;
};
