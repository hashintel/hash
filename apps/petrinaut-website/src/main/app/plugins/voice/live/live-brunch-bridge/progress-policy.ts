import { petrinautToolEffects } from "@hashintel/brunch-agent-plugin-sdcpn";
import { brunchTools } from "@hashintel/brunch-agent/constants";

import type { PetrinautToolCapability } from "@hashintel/brunch-agent-plugin-sdcpn";

type Capability =
  | "read"
  | "mutation"
  | "command"
  | "experiment"
  | "substrate"
  | "other";
type ToolState = "preparing" | "running" | "awaiting-approval";

const petrinautCapabilities = {
  "petrinaut-read": "read",
  "petrinaut-mutation": "mutation",
  "petrinaut-command": "command",
  "petrinaut-experiment": "experiment",
} as const satisfies Record<PetrinautToolCapability, Capability>;

const capabilityOf = (name: string): Capability => {
  if (name === brunchTools.draftPetrinautExperiment) return "experiment";
  if (
    name === "task" ||
    name === brunchTools.activateSkill ||
    name === brunchTools.readSkillResource
  )
    return "substrate";
  if (Object.hasOwn(petrinautToolEffects, name)) {
    const { capability } =
      petrinautToolEffects[name as keyof typeof petrinautToolEffects];
    return petrinautCapabilities[capability];
  }
  // Ledger, explanation, diagnostic and unknown tools share a generic phrase,
  // but must not inherit substrate's immediate running gate.
  return "other";
};

const genericToolPhrase = "Working through the details.";

const phrases = {
  read: "Looking over the model as it stands.",
  mutation: "Making those changes now.",
  command: "Tidying up the layout.",
  experiment: "Setting up the comparison.",
  substrate: genericToolPhrase,
  other: genericToolPhrase,
  thinking: "Give me a moment on this one.",
  "thinking-after-edits": "The edits are in. Give me a moment.",
  "thinking-after-read": "I've had a look at the model. Give me a moment.",
  "thinking-after-experiment": "The comparison is drafted. One moment.",
} as const;

interface Phase {
  readonly phase: keyof typeof phrases | "awaiting-approval";
  readonly state: ToolState | "idle";
  readonly runningFor: number;
  readonly idleFor: number;
}

interface Tool {
  readonly capability: Capability;
  readonly draftsExperiment: boolean;
  startedAt: number;
  state: ToolState;
  endedAt: number | null;
  succeeded: boolean;
}

interface Turn {
  readonly startedAt: number;
  ackAt: number | null;
  readonly tools: Map<string, Tool>;
  readonly lines: { at: number; phase: Phase["phase"] }[];
  lastPhase: string | null;
  settled: boolean;
  userSpeaking: boolean;
  liveSpeaking: boolean;
}

interface Output {
  readonly commentary: (line: string) => boolean;
  readonly thinking: (context: {
    progress: {
      phase: Phase["phase"];
      state: Phase["state"];
      toolsSoFar: number;
      sinceAckMs: number | null;
      spokenLines: number;
    };
  }) => void;
  readonly diagnostic: (
    event: "progress.spoken" | "progress.suppressed",
    metadata: Record<string, string | number | null>,
  ) => void;
}

/** Prototype policy, driven entirely by observed tool transitions and supplied time. */
export class ProgressPolicy {
  readonly #out: Output;
  #turn: Turn | null = null;
  #lastSuppression: string | null = null;

  public constructor(out: Output) {
    this.#out = out;
  }

  public startTurn(now: number): void {
    this.#turn = {
      startedAt: now,
      ackAt: null,
      tools: new Map(),
      lines: [],
      lastPhase: null,
      settled: false,
      userSpeaking: false,
      liveSpeaking: false,
    };
    this.#lastSuppression = null;
  }

  public acknowledged(now: number): void {
    if (this.#turn) this.#turn.ackAt = now;
  }

  /** Call identity, not name, keeps overlapping calls and repeated snapshots distinct. */
  public toolStarted(
    id: string,
    name: string,
    now: number,
    state: ToolState = "running",
  ): void {
    const turn = this.#turn;
    if (!turn || turn.settled) return;
    const previous = turn.tools.get(id);
    if (previous) {
      if (previous.endedAt !== null || previous.state === state) return;
      previous.state = state;
      previous.startedAt = now;
    } else {
      turn.tools.set(id, {
        capability: capabilityOf(name),
        draftsExperiment: name === brunchTools.draftPetrinautExperiment,
        startedAt: now,
        state,
        endedAt: null,
        succeeded: false,
      });
    }
  }

  public toolFinished(id: string, now: number, succeeded: boolean): void {
    const tool = this.#turn?.tools.get(id);
    if (tool && tool.endedAt === null) {
      tool.endedAt = now;
      tool.succeeded = succeeded;
    }
  }

  public userSpeaking(on: boolean): void {
    if (this.#turn) this.#turn.userSpeaking = on;
  }
  public liveSpeaking(on: boolean): void {
    if (this.#turn) this.#turn.liveSpeaking = on;
  }
  public settled(): void {
    if (this.#turn) this.#turn.settled = true;
  }
  public endTurn(): void {
    this.#turn = null;
  }

  #phase(turn: Turn, now: number): Phase {
    const tools = [...turn.tools.values()];
    const active = tools.filter((tool) => tool.endedAt === null);
    // Any approval blocks narration, including when another call is executing.
    if (active.some((tool) => tool.state === "awaiting-approval"))
      return {
        phase: "awaiting-approval",
        state: "awaiting-approval",
        runningFor: 0,
        idleFor: 0,
      };
    const latest = active.at(-1) ?? tools.at(-1);
    if (active.length && latest)
      return {
        phase: latest.capability,
        state: latest.state,
        runningFor: now - latest.startedAt,
        idleFor: 0,
      };
    const mutations = tools.filter((tool) => tool.capability === "mutation");
    const phase = latest?.succeeded
      ? latest.capability === "mutation" &&
        mutations.length >= 3 &&
        mutations.every((tool) => tool.succeeded)
        ? "thinking-after-edits"
        : latest.capability === "read"
          ? "thinking-after-read"
          : latest.draftsExperiment
            ? "thinking-after-experiment"
            : "thinking"
      : "thinking";
    const lastActivity = Math.max(
      turn.startedAt,
      ...tools.flatMap((tool) => [tool.startedAt, tool.endedAt ?? -Infinity]),
    );
    return { phase, state: "idle", runningFor: 0, idleFor: now - lastActivity };
  }

  #thinking(turn: Turn, info: Phase, now: number): void {
    this.#out.thinking({
      progress: {
        phase: info.phase,
        state: info.state,
        toolsSoFar: turn.tools.size,
        sinceAckMs: turn.ackAt === null ? null : now - turn.ackAt,
        spokenLines: turn.lines.length,
      },
    });
  }

  public evaluate(
    now: number,
  ): { speak: boolean; phase: Phase; reason: string | null } | null {
    const turn = this.#turn;
    if (!turn) return null;
    const info = this.#phase(turn, now);
    if (!turn.settled && turn.lastPhase !== `${info.phase}|${info.state}`) {
      this.#thinking(turn, info, now);
      turn.lastPhase = `${info.phase}|${info.state}`;
    }
    const slowClass = info.phase === "experiment" || info.phase === "substrate";
    const checks: readonly (readonly [string, boolean])[] = [
      ["settled", !turn.settled],
      ["person-speaking", !turn.userSpeaking],
      ["live-speaking", !turn.liveSpeaking],
      ["awaiting-approval", info.state !== "awaiting-approval"],
      ["unacknowledged", turn.ackAt !== null],
      ["quiet-after-ack", turn.ackAt !== null && now - turn.ackAt >= 6_000],
      ["no-tools", turn.tools.size > 0],
      [
        "activity",
        info.state === "running"
          ? info.runningFor >= (slowClass ? 0 : 2_500)
          : info.state === "idle" && info.idleFor >= 5_000,
      ],
      ["line-cap", turn.lines.length === 0],
    ];
    const reason = checks.find(([, passed]) => !passed)?.[0] ?? null;
    if (reason !== null) {
      const key = `${reason}|${info.phase}`;
      if (
        this.#lastSuppression !== key &&
        turn.ackAt !== null &&
        !turn.settled &&
        !turn.liveSpeaking
      ) {
        this.#lastSuppression = key;
        this.#out.diagnostic("progress.suppressed", {
          reason,
          phase: info.phase,
          sinceAckMs: now - turn.ackAt,
        });
      }
      return { speak: false, phase: info, reason };
    }
    if (info.phase === "awaiting-approval")
      return { speak: false, phase: info, reason: "awaiting-approval" };
    const line = phrases[info.phase];
    // A refused append consumes its slot too: never retry or replay automatically.
    turn.lines.push({ at: now, phase: info.phase });
    this.#thinking(turn, info, now);
    const sent = this.#out.commentary(line);
    this.#lastSuppression = null;
    this.#out.diagnostic(sent ? "progress.spoken" : "progress.suppressed", {
      phase: info.phase,
      sinceAckMs: turn.ackAt === null ? null : now - turn.ackAt,
      ...(sent ? {} : { reason: "send-failed" }),
    });
    return { speak: sent, phase: info, reason: sent ? null : "send-failed" };
  }
}
