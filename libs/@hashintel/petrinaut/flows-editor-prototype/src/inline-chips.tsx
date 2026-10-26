/**
 * Inline value chips in free text (26 Oct design sync, T26):
 *
 * - Shape B: the DS `Chip` square md (Figma 628:21338), no icon. Hover shows the whole path.
 * - Hover also shows a "…" that overlays the chip's right edge on a fade; the chip never grows, so nothing reflows
 *   (Dei). Click opens Change, Fallback, Remove under the path (Figma 637:24136).
 * - No colour on a normal chip. Yellow = may be empty when it runs; red = broken now (Dei: colour only what needs it).
 * - Every chip can take a fallback, even when none seems needed (Dei). A fallback replaces the value, or the whole
 *   line, so "Hi ," never goes out (Dei, Ciarán). A preview shows the text with values and when values are empty
 *   (Dora).
 *
 * MOCK: which outputs may be empty or are broken, and their sample values, are made up for the prototype. The engine
 * has no optional/required data on step outputs yet.
 */
import { useRef, useState } from "react";

import {
  Button,
  Chip,
  Icon,
  Popover,
  RadioGroup,
  SegmentedControl,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { RefFallback, RefSource, TemplatePart } from "./document";

export type RefStatus = { tone: "warning" | "broken"; why: string } | null;

/** MOCK: outputs the made-up graph may leave empty, or that point at nothing. Keyed by output name. */
const mockOutputStatus: Record<string, NonNullable<RefStatus>> = {
  contactName: {
    tone: "warning",
    why: "May be empty when it runs: not every supplier has a contact name",
  },
  lowestPurity: {
    tone: "warning",
    why: "May be empty when it runs: a batch may have no purity result yet",
  },
  primaryContactEmail: {
    tone: "broken",
    why: "Broken: Primary contact has no Email",
  },
};

/** MOCK: what each value reads as in the preview. */
const mockSamples: Record<string, string> = {
  count: "3",
  lowestPurity: "91.2%",
  batchIds: "B-1042, B-1047, B-1051",
  contactName: "Priya",
  name: "Northfield Chemicals",
  primaryContactEmail: "priya@northfield.example",
};

const outputNameOf = (source: RefSource) =>
  source.kind === "step-output" ? source.outputName : undefined;

/** Yellow or red, or nothing. A fallback settles a "may be empty"; a broken reference stays red until it is fixed. */
export const refStatus = (part: Extract<TemplatePart, { kind: "ref" }>) => {
  const name = outputNameOf(part.source);
  const status = name ? mockOutputStatus[name] : undefined;
  if (!status) {
    return null;
  }
  return status.tone === "warning" && part.fallback ? null : status;
};

const sampleOf = (source: RefSource, path: string[]) => {
  const name = outputNameOf(source);
  return (name && mockSamples[name]) ?? path.at(-1) ?? "";
};

/** The chip as it sits in the text: the DS Chip, square, md, grey; yellow or red only when something is wrong. */
export const InlineChip = ({
  status,
  children,
}: {
  status: RefStatus;
  children: React.ReactNode;
}) => (
  <Chip
    size="md"
    color={
      status?.tone === "broken"
        ? "red"
        : status?.tone === "warning"
          ? "yellow"
          : "grey"
    }
  >
    {children}
  </Chip>
);

/* ----------------------------------------------------------------------------------------------------------------
 * Hover: the path above the chip, and the "…" over its right edge
 * ------------------------------------------------------------------------------------------------------------- */

export type HoveredChip = {
  index: number;
  /** The chip's box, relative to the field. */
  box: { left: number; top: number; width: number; height: number };
  tone: "grey" | "yellow" | "red";
};

/** The chip's whole box: hovering it opens the DS Tooltip with the path. Clicks pass to the "…" only. */
const hitStyle = css({ position: "absolute", zIndex: "[4]", display: "block" });

const fillStyle = css({ position: "relative", display: "block", width: "[100%]", height: "[100%]" });

/** Sits inside the chip's 1 px border, so the border stays crisp; a short fade, then the chip's own fill. */
const moreStyle = css({
  position: "absolute",
  top: "[1px]",
  bottom: "[1px]",
  right: "[1px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  width: "[24px]",
  paddingRight: "[3px]",
  border: "none",
  cursor: "pointer",
  borderTopRightRadius: "[3px]",
  borderBottomRightRadius: "[3px]",
  _hover: { opacity: "[0.7]" },
});

const paletteOf = { grey: "neutral", yellow: "yellow", red: "red" } as const;

export const ChipHoverLayer = ({
  hovered,
  path,
  note,
  moreRef,
  onMore,
}: {
  hovered: HoveredChip;
  path: string;
  note?: string;
  moreRef: React.RefObject<HTMLButtonElement | null>;
  onMore: () => void;
}) => {
  const { box, tone } = hovered;
  const fill = `var(--colors-${paletteOf[tone]}-bg-solid-subtle)`;
  return (
    <span
      className={hitStyle}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      }}
    >
      {/* The DS Tooltip's own trigger span fills the chip's box, so the path opens above the chip. */}
      <Tooltip
        content={note ? `${path} · ${note}` : path}
        openDelay="fast"
        className={fillStyle}
      >
        <button
          ref={moreRef}
          type="button"
          aria-label={`More for ${path}`}
          className={moreStyle}
          // The text runs under the "…" instead of the chip growing (Dei, T26): 8 px of fade, then solid fill.
          style={{
            background: `linear-gradient(to right, transparent, ${fill} 8px)`,
            // The chip's own text colour, so the "…" reads as part of it (evaluator, round 2).
            color: `var(--colors-${paletteOf[tone]}-fg-link)`,
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onMore}
        >
          <Icon name="ellipsis" size="xs" />
        </button>
      </Tooltip>
    </span>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Fallback: what goes out when the value is empty
 * ------------------------------------------------------------------------------------------------------------- */

const surfaceStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "[300px]",
  padding: "3",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  boxShadow: "md",
  "&:focus": { outline: "none" },
});

const headingStyle = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "neutral.fg.heading",
});

const hintStyle = css({ textStyle: "xs", color: "neutral.fg.subtle" });

type FallbackChoice = "none" | "text" | "line";

export const FallbackPopover = ({
  anchor,
  path,
  value,
  onChange,
  onClose,
}: {
  anchor: React.RefObject<Element | null>;
  path: string;
  value: RefFallback | undefined;
  onChange: (next: RefFallback | undefined) => void;
  onClose: () => void;
}) => {
  const focusRef = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState<FallbackChoice>(value?.mode ?? "text");
  const [text, setText] = useState(value?.text ?? "");

  const save = () => {
    onChange(choice === "none" ? undefined : { mode: choice, text });
    onClose();
  };

  return (
    <Popover
      triggerRef={anchor}
      position="bottom-start"
      gapY={6}
      initialFocusRef={focusRef}
      onClose={onClose}
    >
      <div ref={focusRef} tabIndex={-1} className={surfaceStyle}>
        <div>
          <div className={headingStyle}>If {path} is empty</div>
          <div className={hintStyle}>What the email says instead.</div>
        </div>
        <RadioGroup
          size="sm"
          value={choice}
          onChange={(next) => setChoice(next)}
          items={[
            { value: "text", label: "Use this text instead" },
            { value: "line", label: "Replace the whole line" },
            { value: "none", label: "Leave it empty" },
          ]}
        />
        {choice === "none" ? null : (
          <TextInput
            size="sm"
            value={text}
            aria-label="Fallback text"
            placeholder={
              choice === "line"
                ? "Leave blank to drop the line"
                : "e.g. there"
            }
            onChange={setText}
          />
        )}
        <div
          className={css({ display: "flex", justifyContent: "flex-end", gap: "2" })}
        >
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="solid" onClick={save}>
            Done
          </Button>
        </div>
      </div>
    </Popover>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Preview: the text with values, and when values are empty
 * ------------------------------------------------------------------------------------------------------------- */

type PreviewMode = "values" | "empty";

const previewStyle = css({
  paddingX: "2.5",
  paddingY: "2",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.subtle",
  textStyle: "sm",
  color: "neutral.fg.body",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

/** An empty slot: a full-height dashed red box, so a missing value can't be missed (evaluator, 26 Oct). */
const gapMarkStyle = css({
  display: "inline-block",
  width: "[28px]",
  height: "[1.2em]",
  verticalAlign: "text-bottom",
  marginX: "[2px]",
  borderWidth: "[1px]",
  borderStyle: "dashed",
  // The red chip's own text colour: the bd tokens read pink on the grey preview box (evaluator, round 3).
  borderColor: "red.fg.link",
  borderRadius: "sm",
  backgroundColor: "red.bgSolid.subtle",
});

const fallbackMarkStyle = css({
  backgroundColor: "yellow.bgSolid.subtle",
  borderRadius: "sm",
});

/** One line of the preview: what each part becomes. */
type Piece =
  | { kind: "text"; text: string }
  | { kind: "gap" }
  | { kind: "fallback"; text: string };

const resolveLines = (
  parts: TemplatePart[],
  mode: PreviewMode,
  pathOf: (source: RefSource) => string[],
): Piece[][] => {
  const lines: Piece[][] = [[]];
  const replaced = new Map<number, string>();
  for (const part of parts) {
    if (part.kind === "text") {
      const [first, ...rest] = part.text.split("\n");
      lines.at(-1)!.push({ kind: "text", text: first ?? "" });
      for (const line of rest) {
        lines.push([{ kind: "text", text: line }]);
      }
      continue;
    }
    const name = outputNameOf(part.source);
    const empty = mode === "empty" && !!name && name in mockOutputStatus;
    if (!empty) {
      lines
        .at(-1)!
        .push({ kind: "text", text: sampleOf(part.source, pathOf(part.source)) });
    } else if (part.fallback?.mode === "line") {
      replaced.set(lines.length - 1, part.fallback.text);
    } else if (part.fallback?.mode === "text") {
      lines.at(-1)!.push({ kind: "fallback", text: part.fallback.text });
    } else {
      lines.at(-1)!.push({ kind: "gap" });
    }
  }
  const isBlank = (line: Piece[]) =>
    line.every((piece) => piece.kind === "text" && piece.text === "");
  const kept = lines.flatMap((line, index) => {
    if (!replaced.has(index)) {
      return [line];
    }
    const text = replaced.get(index)!;
    // A blank line fallback drops the line, and the blank line after it, so no gap is left behind.
    if (text === "") {
      if (lines[index + 1] && isBlank(lines[index + 1]!)) {
        replaced.set(index + 1, "");
      }
      return [];
    }
    return [[{ kind: "fallback" as const, text }]];
  });
  // Never start the email with an empty line.
  while (kept[0] && isBlank(kept[0])) {
    kept.shift();
  }
  return kept;
};

export const TemplatePreview = ({
  parts,
  pathOf,
}: {
  parts: TemplatePart[];
  pathOf: (source: RefSource) => string[];
}) => {
  const [mode, setMode] = useState<PreviewMode>("values");
  const lines = resolveLines(parts, mode, pathOf);
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
      <SegmentedControl
        size="sm"
        value={mode}
        onChange={setMode}
        items={[
          { value: "values", label: "With values" },
          { value: "empty", label: "When values are empty" },
        ]}
      />
      <div className={previewStyle} aria-live="polite">
        {lines.map((line, lineIndex) => (
          // A line of the preview has no id of its own; its place is its key.
          // eslint-disable-next-line react/no-array-index-key
          <div key={lineIndex}>
            {line.every((piece) => piece.kind === "text" && piece.text === "")
              ? " "
              : null}
            {line.map((piece, pieceIndex) =>
              piece.kind === "text" ? (
                // eslint-disable-next-line react/no-array-index-key
                <span key={pieceIndex}>{piece.text}</span>
              ) : piece.kind === "gap" ? (
                // eslint-disable-next-line react/no-array-index-key
                <span key={pieceIndex} className={gapMarkStyle} title="Empty: no fallback" />
              ) : (
                // eslint-disable-next-line react/no-array-index-key
                <span key={pieceIndex} className={fallbackMarkStyle} title="Fallback">
                  {piece.text}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
