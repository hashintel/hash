export interface MatchedParityScenario {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly required: {
    readonly executableCode: boolean;
    readonly layout: boolean;
    readonly metric: boolean;
    readonly scenario: boolean;
    readonly title: boolean;
    readonly visualization: boolean;
  };
}

/** Exact prompt behind Petrinaut's empty-net “Surprise me” chip. */
export const surpriseMePrompt =
  "Pick an interesting domain and build a small but complete SDCPN end-to-end — use all available features (including place visualizers).";

export const matchedParityScenarios: readonly MatchedParityScenario[] = [
  {
    id: "surprise-me",
    label: "Surprise me",
    prompt: surpriseMePrompt,
    required: {
      executableCode: false,
      layout: false,
      metric: false,
      scenario: false,
      title: false,
      visualization: true,
    },
  },
  {
    id: "scoped-executable-construction",
    label: "Scoped executable construction",
    prompt:
      "In this empty document, build a small single-server queue SDCPN. Give the net a descriptive title. Include at least Waiting, Serving, and Completed places and executable transition code that moves work through the queue. Add a saved Baseline scenario with an initial queue, a saved Throughput metric implemented with executable code, and a place visualizer implemented with executable code. Apply automatic layout when construction is complete, check compilation diagnostics, and fix any errors you find. Keep the model deliberately small and finish the construction rather than interviewing me.",
    required: {
      executableCode: true,
      layout: true,
      metric: true,
      scenario: true,
      title: true,
      visualization: true,
    },
  },
];

export const scenariosForArm = (
  _arm: "S" | "F" | "I",
): readonly MatchedParityScenario[] => matchedParityScenarios;
