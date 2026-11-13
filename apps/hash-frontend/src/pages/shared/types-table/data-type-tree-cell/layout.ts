import type { DataTypeLabelPart } from "../shared/data-type-label-preview";

type Measure = (text: string, kind?: DataTypeLabelPart["kind"]) => number;

const fitText = (
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
) => {
  const characters = Array.from(text);
  let lower = 0;
  let upper = characters.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (measure(characters.slice(0, middle).join("")) <= maxWidth) {
      lower = middle;
    } else {
      upper = middle - 1;
    }
  }
  return characters.slice(0, lower).join("");
};

const measureParts = (parts: DataTypeLabelPart[], measure: Measure) =>
  parts.reduce((width, part) => width + measure(part.text, part.kind), 0);

const truncatePreview = (
  parts: DataTypeLabelPart[],
  maxWidth: number,
  measure: Measure,
): DataTypeLabelPart[] => {
  if (measureParts(parts, measure) <= maxWidth) {
    return parts;
  }
  const ellipsis: DataTypeLabelPart = { kind: "punctuation", text: "…" };
  let remaining = maxWidth - measure(ellipsis.text, ellipsis.kind);
  if (remaining < 0) {
    return [];
  }
  const visible: DataTypeLabelPart[] = [];
  for (const part of parts) {
    const text = fitText(part.text, remaining, (value) =>
      measure(value, part.kind),
    );
    if (text) {
      visible.push({ ...part, text });
      remaining -= measure(text, part.kind);
    }
    if (text !== part.text) {
      break;
    }
  }
  return [...visible, ellipsis];
};

export const getDataTypeCellLayout = ({
  title,
  preview = [],
  availableWidth,
  measure,
}: {
  title: string;
  preview?: DataTypeLabelPart[];
  availableWidth: number;
  measure: Measure;
}) => {
  const chipPadding = 44;
  const arrowWidth = 16;
  const gap = 16;
  const previewBudget = Math.max(
    0,
    Math.min(availableWidth * 0.4, availableWidth - 100 - gap),
  );
  const visiblePreview = truncatePreview(preview, previewBudget, measure);
  const previewWidth = measureParts(visiblePreview, measure);
  const previewSpace = visiblePreview.length ? previewWidth + gap : 0;
  const titleWidth = Math.max(
    0,
    availableWidth - previewSpace - chipPadding - arrowWidth,
  );
  let visibleTitle = title;
  if (measure(title) > titleWidth) {
    visibleTitle =
      measure("…") <= titleWidth
        ? `${fitText(title, titleWidth - measure("…"), measure)}…`
        : "";
  }
  return {
    title: visibleTitle,
    preview: visiblePreview,
    previewWidth,
    chipAreaWidth: Math.max(0, availableWidth - previewSpace),
  };
};
