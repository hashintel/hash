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

const previewValue = (schema: SingleValueSchema): DataTypeLabelPart[] => {
  if (schema.type !== "array") {
    return labelValue([placeholder], schema.label);
  }

  if (schema.items === false) {
    const items = (schema.prefixItems ?? []).map(previewValue);
    return labelValue(
      [punctuation("["), ...joinParts(items, ", "), punctuation("]")],
      schema.label,
    );
  }

  const item = schema.items ? previewValue(schema.items) : [placeholder];
  const count = Math.min(schema.maxItems ?? 2, 2);
  const items = Array.from({ length: count }, () => item);
  if (schema.maxItems === undefined || schema.maxItems > count) {
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
  const label = resolveLabel(schema, dataTypes);
  if (label === null) {
    return undefined;
  }

  let preview: DataTypeLabelPart[];
  if ("anyOf" in schema) {
    const options = schema.anyOf.map(previewValue);
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
    preview = previewValue({ ...schema, label });
  }
  return preview.some(({ kind, text }) => kind === "label" && text.trim())
    ? preview.map((part) => ({
        ...part,
        text: part.text.replace(/\s+/gu, " "),
      }))
    : undefined;
};
