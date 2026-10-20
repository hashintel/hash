import { toolCategories } from "./tool-categories.ts";

import type {
  Distribution,
  PacketExchange,
  RunPacket,
} from "./build-run-packet.ts";

const seconds = (ms: number | null): string =>
  ms === null ? "–" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;

const share = (part: number | null, whole: number): string =>
  part === null || whole === 0 ? "–" : `${Math.round((100 * part) / whole)}%`;

const distribution = ({ median, p90, max }: Distribution): string =>
  `median ${seconds(median)}, p90 ${seconds(p90)}, max ${seconds(max)}`;

const table = (
  header: readonly string[],
  rows: readonly (readonly string[])[],
) =>
  [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

const toolMix = (exchange: PacketExchange): string =>
  toolCategories
    .flatMap((category) =>
      exchange.categories[category].calls === 0
        ? []
        : [`${category} ${exchange.categories[category].calls}`],
    )
    .join(", ");

const netCell = (exchange: PacketExchange): string =>
  exchange.netAfter === null
    ? "–"
    : `${exchange.netAfter.places}/${exchange.netAfter.transitions}/${exchange.netAfter.arcs}`;

/** The packet as Markdown for reading beside the run's transcript. */
export const renderRunPacket = (packet: RunPacket): string => {
  const { metadata, summary } = packet;
  const lines: string[] = [`# Run packet: ${packet.label}`, ""];
  if (metadata) {
    lines.push(
      `- Case: ${metadata.caseName ?? "–"}`,
      `- Brunch: ${metadata.brunchModel ?? "default"} (${metadata.brunchThinking ?? "default"})`,
      `- Persona: ${metadata.personaAgent ?? "–"}`,
      `- Guidance: ${metadata.guidanceSha256?.slice(0, 12) ?? "–"}`,
      `- Created: ${metadata.createdAt ?? "–"}`,
    );
  }
  if (!packet.sources.chronology) {
    lines.push(
      "- No server-log chronology: argument-streaming times are unknown, and time before output includes argument streaming for steps without text.",
    );
  }
  const { skipped } = packet.sources;
  const { incomplete } = summary;
  const gaps = [
    [
      incomplete.unsettledExchanges,
      "never settled, left out of the time sums",
      "exchange",
    ],
    [incomplete.cutOffMessages, "cut off before its message completed", "step"],
    [
      incomplete.cutOffToolPhases,
      "cut off before its tool results were committed",
      "step",
    ],
    [skipped.batches, "unreadable, skipped", "stream batch"],
    [skipped.events, "malformed, skipped", "stream event"],
    [skipped.chronologyLines, "unreadable, skipped", "chronology line"],
  ] as const;
  const found = gaps.flatMap(([count, what, noun]) =>
    count === 0 ? [] : [`${count} ${noun}${count === 1 ? "" : "s"} ${what}`],
  );
  if (found.length > 0) {
    lines.push(`- Incomplete run: ${found.join("; ")}.`);
  }
  lines.push(
    "",
    "## Summary",
    "",
    `${summary.exchanges} exchanges, ${seconds(summary.activeMs)} of Brunch time (${seconds(summary.wallMs)} wall, less ${seconds(summary.approvalWaitMs)} waiting on approvals); ${summary.steps} model steps (${summary.stepsPerExchange?.toFixed(1) ?? "–"} per exchange: ${summary.stepsByToolCount.none} without tools, ${summary.stepsByToolCount.one} with one, ${summary.stepsByToolCount.several} with several).`,
    "",
    `- Per exchange: ${distribution(summary.activePerExchangeMs)}`,
    `- Until first reply text (approval waits included): ${distribution(summary.untilFirstTextMs)}`,
    "",
    table(
      ["Where the time goes", "Time", "Share of Brunch time"],
      [
        [
          "Model steps",
          seconds(summary.modelMs),
          share(summary.modelMs, summary.activeMs),
        ],
        [
          "… before first output (hidden reasoning)",
          seconds(summary.beforeOutputMs),
          share(summary.beforeOutputMs, summary.activeMs),
        ],
        [
          "… tool-argument streaming",
          seconds(summary.argumentStreamingMs),
          share(summary.argumentStreamingMs, summary.activeMs),
        ],
        [
          "… reply text",
          seconds(summary.textMs),
          share(summary.textMs, summary.activeMs),
        ],
        [
          "Tool phases (execution, browser round trips)",
          seconds(summary.toolPhaseMs - summary.approvalWaitMs),
          share(summary.toolPhaseMs - summary.approvalWaitMs, summary.activeMs),
        ],
      ],
    ),
    "",
    table(
      [
        "Tool category",
        "Calls",
        "Execution (summed per call)",
        "Argument chars",
      ],
      toolCategories
        .filter((category) => summary.categories[category].calls > 0)
        .map((category) => [
          category,
          String(summary.categories[category].calls),
          seconds(summary.categories[category].executionMs),
          String(summary.categories[category].argumentChars),
        ]),
    ),
    "",
    `- Skill activations: ${
      Object.entries(summary.skillActivations)
        .map(([name, count]) => `${name} ×${count}`)
        .join(", ") || "none"
    }; resource reads: ${summary.skillResourceReads}`,
    `- Skill reloads: ${summary.skillReloads} (${summary.skillReloadsAfterCompaction} after a compaction); compactions: ${summary.compactions}`,
    `- Ledger: ${summary.ledgerCommits} commits (${summary.ledgerRefused} refused), ${summary.ledgerArgumentChars} argument chars`,
    `- Tool calls of ${seconds(30_000)} or more (likely approval waits): ${summary.longToolCalls}`,
    `- Tokens: ${summary.usage.inputTokens} input, ${summary.usage.cacheReadTokens} cache read, ${summary.usage.cacheWriteTokens} cache write, ${summary.usage.outputTokens} output (${summary.usage.reasoningTokens} reasoning); USD ${summary.usage.costUsd.toFixed(2)}`,
  );
  if (packet.finalLedger) {
    const ledger = packet.finalLedger;
    lines.push(
      `- Final Ledger: ${ledger.acceptedCommits} accepted commits, ${ledger.entities} entities, ${ledger.claims} claims, ${ledger.obligations} obligations`,
    );
  }
  if (packet.finalNet) {
    const net = packet.finalNet;
    lines.push(
      `- Final net: ${net.places} places, ${net.transitions} transitions, ${net.arcs} arcs; ${net.tokenTypes} token types, ${net.colouredPlaces} coloured places; ${net.parameters} parameters, ${net.differentialEquations} equations, ${net.metrics} metrics, ${net.scenarios} scenarios`,
    );
  }
  lines.push(
    "",
    "## Exchanges",
    "",
    table(
      [
        "#",
        "Active",
        "First text",
        "Steps",
        "Before output",
        "Args",
        "Tools",
        "Commit chars",
        "Net P/T/A",
        "Tool mix",
        "Skills",
      ],
      packet.exchanges.map((exchange) => [
        exchange.outcome === "completed"
          ? String(exchange.index)
          : `${exchange.index} (${exchange.outcome ?? (exchange.wallMs === null ? "unsettled" : "no outcome")})`,
        seconds(exchange.activeMs),
        seconds(exchange.untilFirstTextMs),
        String(exchange.steps.length),
        seconds(exchange.beforeOutputMs),
        seconds(exchange.argumentStreamingMs),
        seconds(exchange.toolPhaseMs),
        String(exchange.ledger.argumentChars),
        netCell(exchange),
        toolMix(exchange),
        [
          ...exchange.compactions.map(() => "⟲ compaction"),
          ...exchange.skillActivations,
        ].join(", "),
      ]),
    ),
    "",
    "## Step shapes",
    "",
    ...packet.exchanges.map(
      (exchange) => `${exchange.index}. ${exchange.stepShape.join(" → ")}`,
    ),
    "",
    "## Scoring",
    "",
    `Against the case's \`key.md\`: not scored.`,
    "",
  );
  return lines.join("\n");
};
