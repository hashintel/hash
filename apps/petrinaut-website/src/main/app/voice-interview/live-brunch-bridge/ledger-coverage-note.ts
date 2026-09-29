import type { FlueConversationState } from "@flue/sdk";

export interface AppliedWorkpieceRevision {
  /** Tool-call id of the applied `mutate_workpiece` call; the citation identity. */
  readonly revisionId: string;
  /** Presentation-only counter from the settlement output. */
  readonly ordinal: number | undefined;
  readonly markdown: string;
}

/** GPT-Live accepts at most 500 tokens per append; stay well inside it. */
const noteCharacterBudget = 1_400;

const workpieceMutationToolName = "mutate_workpiece";

/** Optional epistemic annotations from the workpiece template that mark a claim as unsettled. */
const openMarkers = [
  "Not yet asked",
  "Unknown",
  "Assumed",
  "Deferred",
  "Conflict",
  "Declined",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const headingPattern = /^(#{1,6})\s+(.+?)\s*$/;

interface Section {
  readonly level: number;
  readonly title: string;
  /** Own lines plus lines of deeper headings, until the next heading at this level or above. */
  readonly nestedBody: readonly string[];
}

const parseSections = (markdown: string): Section[] => {
  const lines = markdown.split(/\r?\n/);
  const headings: { level: number; title: string; line: number }[] = [];
  let insideFence = false;
  for (const [index, line] of lines.entries()) {
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    const match = headingPattern.exec(line);
    if (match) {
      headings.push({
        level: match[1]!.length,
        title: match[2]!,
        line: index,
      });
    }
  }
  return headings.map((heading, position) => {
    const closer = headings
      .slice(position + 1)
      .find((candidate) => candidate.level <= heading.level);
    return {
      level: heading.level,
      title: heading.title,
      nestedBody: lines
        .slice(heading.line + 1, closer?.line ?? lines.length)
        .filter((line) => !headingPattern.test(line)),
    };
  });
};

const hasContent = (body: readonly string[]): boolean =>
  body.some((line) => line.trim() !== "");

const openMarkerPattern = new RegExp(`\\b(${openMarkers.join("|")})\\b`);

/**
 * Renders a short quiet-context note about which Ledger sections hold settled
 * claims, which are annotated as open, and which are still empty. Heuristic:
 * it reads the workpiece template's heading shape, not Brunch's judgement.
 */
export const describeLedgerCoverage = ({
  markdown,
  ordinal,
}: AppliedWorkpieceRevision): string => {
  const sections = parseSections(markdown);
  const leafSections = sections.filter((section) => section.level === 3);
  const filled: string[] = [];
  const open: string[] = [];
  const empty: string[] = [];
  for (const section of leafSections) {
    if (!hasContent(section.nestedBody)) {
      empty.push(section.title);
    } else if (
      section.nestedBody.some((line) => openMarkerPattern.test(line))
    ) {
      open.push(section.title);
    } else {
      filled.push(section.title);
    }
  }
  const issueCount = sections
    .filter(
      (section) => section.level === 2 && /issue ledger/i.test(section.title),
    )
    .flatMap((section) => section.nestedBody)
    .filter((line) => /^\s*[-*]\s+\S/.test(line)).length;

  const header = `Quiet context from Brunch's Ledger of settled facts${
    ordinal === undefined ? "" : ` (revision ${ordinal})`
  }.`;
  const sentences = [
    filled.length ? `Settled: ${filled.join("; ")}.` : "",
    open.length
      ? `Recorded but marked open (${openMarkers.join(", ")}): ${open.join("; ")}.`
      : "",
    empty.length ? `Not yet covered: ${empty.join("; ")}.` : "",
    issueCount ? `Open cross-cutting issues: ${issueCount}.` : "",
  ].filter((sentence) => sentence !== "");
  const footer =
    "Use this only to describe progress accurately. Brunch asks the substantive questions; do not read headings aloud or claim a change Brunch has not reported.";

  const compose = (parts: readonly string[]) =>
    [header, ...parts, footer].join(" ");
  let note = compose(sentences);
  // Drop the least useful sentence first rather than cutting mid-word.
  for (const drop of ["Not yet covered", "Recorded but marked open"]) {
    if (note.length <= noteCharacterBudget) break;
    note = compose(sentences.filter((sentence) => !sentence.startsWith(drop)));
  }
  if (note.length > noteCharacterBudget) {
    note = `${note.slice(0, noteCharacterBudget - 1).trimEnd()}…`;
  }
  return note;
};

/**
 * Finds the latest applied workpiece revision. Only a `mutate_workpiece`
 * result whose output binds its own call (`revisionId === toolCallId`) counts;
 * refused, pending or unbound inputs are not state. Returns null when the
 * conversation has no applied revision.
 */
export const selectAppliedWorkpieceRevision = (
  messages: FlueConversationState["messages"],
): AppliedWorkpieceRevision | null => {
  for (const message of messages.toReversed()) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const part of message.parts.toReversed()) {
      if (
        part.type !== "dynamic-tool" ||
        part.toolName !== workpieceMutationToolName ||
        part.state !== "output-available" ||
        !isRecord(part.output) ||
        !isRecord(part.input) ||
        part.output.disposition === "refused" ||
        part.output.applied === false ||
        part.output.revisionId !== part.toolCallId ||
        typeof part.input.markdown !== "string"
      )
        continue;
      return {
        revisionId: part.toolCallId,
        ordinal:
          typeof part.output.ordinal === "number"
            ? part.output.ordinal
            : undefined,
        markdown: part.input.markdown,
      };
    }
  }
  return null;
};
