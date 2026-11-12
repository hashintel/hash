/**
 * The host-rendered text of everything freshness counts, and its parsers:
 * net results as tool results carry them, the `net_view` section, and the
 * hand-edit note. Freshness parses only these, never model or user text.
 */
import { netResultView } from "../net-view";

// ─── Net results ─────────────────────────────────────────────────────────────

/** A net read that reported the revision it observed. */
export const renderNetRead = (output: unknown, revision: string): string =>
  JSON.stringify({ output, netRevision: revision });

/** A change that produced `revision` and read the net back. */
export const renderNetChange = (
  output: unknown,
  readBack: unknown,
  revision: string,
): string =>
  JSON.stringify({ output, netAfterChanges: readBack, netRevision: revision });

/** Any other result, and a change whose read-back was pruned: the bare output. */
export const renderPlainResult = (output: unknown): string =>
  JSON.stringify(output);

/**
 * A successful browser result as the model reads it: a read with its
 * revision, a change with its read-back and revision, anything else bare.
 */
export const renderBrowserResult = (
  toolName: string,
  output: unknown,
  metadata: unknown,
): string => {
  const view = netResultView(toolName, metadata);
  if (view?.kind === "read" && view.revision !== undefined)
    return renderNetRead(output, view.revision);
  if (view?.kind === "change")
    return renderNetChange(output, view.readBack, view.revision);
  return renderPlainResult(output);
};

export type NetResultText = {
  readonly output: unknown;
  readonly netRevision: string;
  /** Present on a change's result only. */
  readonly netAfterChanges?: unknown;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A rendered net result: a JSON object with an `output` and a string `netRevision`. */
export const parseNetResultText = (text: string): NetResultText | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    !isRecord(parsed) ||
    !("output" in parsed) ||
    typeof parsed.netRevision !== "string"
  )
    return undefined;
  return {
    output: parsed.output,
    netRevision: parsed.netRevision,
    ...("netAfterChanges" in parsed
      ? { netAfterChanges: parsed.netAfterChanges }
      : {}),
  };
};

// ─── The `net_view` section ──────────────────────────────────────────────────

export const netViewSectionKey = "net_view";

/** The section's text: `body` is the restored view's output for a read, its read-back for a change. */
export const renderNetViewSection = (revision: string, body: string): string =>
  `Before the conversation was summarized, you last saw the net as:\n<net-view revision="${revision}">${body}</net-view>`;

const netViewPattern = /<net-view revision="([^"]+)">([\s\S]*)<\/net-view>/u;

/** The complete `<net-view>` block a section's text holds. */
export const parseNetViewSection = (
  text: string,
): { readonly revision: string; readonly body: string } | undefined => {
  const match = netViewPattern.exec(text);
  const revision = match?.[1];
  const body = match?.[2];
  return revision === undefined || body === undefined
    ? undefined
    : { revision, body };
};

// ─── The hand-edit note ──────────────────────────────────────────────────────

/** The kind of the entry a hand-edit report writes. */
export const handEditEntryKind = "brunch.hand-edit";

/** The note's model-facing text (H5: a short note naming the revision). */
export const renderHandEditNote = (revision: string): string =>
  `<hand-edit revision="${revision}">The user changed the net in the editor; it is now at revision ${revision}. A net view of yours at another revision is out of date: read the net before changing it.</hand-edit>`;

const handEditPattern = /<hand-edit revision="([^"]+)">/u;

/** The revision a note names. */
export const parseHandEditNote = (text: string): string | undefined =>
  handEditPattern.exec(text)?.[1];
