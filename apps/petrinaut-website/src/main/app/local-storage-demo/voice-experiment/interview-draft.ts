import type { SDCPN } from "@hashintel/petrinaut-core";

export type InterviewTranscriptLine = {
  speaker: "assistant" | "expert";
  transcript: string;
  turnId: number;
};

export type InterviewCaptureToolName =
  | "record_model_requirement"
  | "record_process_decision"
  | "record_process_flow"
  | "record_process_state"
  | "record_process_step";

export type InterviewCapture = {
  captureId: string;
  input: Record<string, unknown>;
  toolName: InterviewCaptureToolName;
};

export type FinalizeInterviewInput = {
  captures: InterviewCapture[];
  conversationId: string;
  readiness: "captures" | "elicitor" | "finalize";
  revision: number;
  transcript: InterviewTranscriptLine[];
};

export type InterviewDraftResult = {
  captures: InterviewCapture[];
  conversationId: string;
  petriNetDefinition: SDCPN;
  revision: number;
  source: "brunch" | "mock";
  title: string;
  transcript: InterviewTranscriptLine[];
  warnings: string[];
};

export type FinalizeInterview = (
  input: FinalizeInterviewInput,
) => InterviewDraftResult | Promise<InterviewDraftResult>;

const stringProperty = (
  input: Record<string, unknown>,
  property: string,
): string | null => {
  const value = input[property];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const allowedCaptureProperties = {
  record_model_requirement: ["category", "description"],
  record_process_decision: ["condition", "outcomes"],
  record_process_flow: ["condition", "from", "to"],
  record_process_state: ["category", "description", "name", "tokenDescription"],
  record_process_step: ["description", "name", "owner", "timing", "trigger"],
} satisfies Record<InterviewCaptureToolName, string[]>;

const isInterviewCaptureToolName = (
  toolName: string,
): toolName is InterviewCaptureToolName =>
  Object.hasOwn(allowedCaptureProperties, toolName);

const safeCaptureValue = (value: unknown): string | string[] | null => {
  if (typeof value === "string") {
    const sanitized = value
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 500);
    return sanitized || null;
  }
  if (Array.isArray(value)) {
    const sanitized = value
      .filter((item): item is string => typeof item === "string")
      .map((item) =>
        item.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 500),
      )
      .filter(Boolean)
      .slice(0, 20);
    return sanitized.length > 0 ? sanitized : null;
  }
  return null;
};

export const createInterviewCapture = ({
  captureId,
  input,
  toolName,
}: {
  captureId: string;
  input: unknown;
  toolName: string;
}): InterviewCapture | null => {
  if (
    !isInterviewCaptureToolName(toolName) ||
    typeof input !== "object" ||
    input === null
  ) {
    return null;
  }
  const inputRecord = input as Record<string, unknown>;
  const sanitizedInput = Object.fromEntries(
    allowedCaptureProperties[toolName].flatMap((property) => {
      const value = safeCaptureValue(inputRecord[property]);
      return value === null ? [] : [[property, value]];
    }),
  );
  if (Object.keys(sanitizedInput).length === 0) {
    return null;
  }
  const sanitizedCaptureId = captureId.normalize("NFKC").trim().slice(0, 128);
  if (!sanitizedCaptureId) {
    return null;
  }

  return {
    captureId: sanitizedCaptureId,
    input: sanitizedInput,
    toolName,
  };
};

const identifierFrom = (value: string, fallback: string): string => {
  const words = value.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const identifier = words
    .map((word) => `${word[0]?.toLocaleUpperCase() ?? ""}${word.slice(1)}`)
    .join("")
    .replace(/^\d/u, "N$&");
  return identifier || fallback;
};

const titleFrom = (transcript: readonly InterviewTranscriptLine[]): string => {
  const expertTopic = transcript.find(
    (line) => line.speaker === "expert" && line.transcript.trim(),
  )?.transcript;
  const topic = expertTopic
    ?.normalize("NFKC")
    .replace(/\s+/gu, " ")
    .replace(/[.!?]+$/u, "")
    .trim()
    .slice(0, 60);
  return `${topic || "Voice interview"} — mock draft`;
};

const emptyNetFields: Pick<
  SDCPN,
  "differentialEquations" | "parameters" | "types"
> = {
  differentialEquations: [],
  parameters: [],
  types: [],
};

const createFallbackDraft = (
  topic: string,
): { petriNetDefinition: SDCPN; warnings: string[] } => {
  const topicIdentifier = identifierFrom(topic, "Interview");
  const inputPlaceId = "place__mock-interview-input";
  const outputPlaceId = "place__mock-draft-ready";

  return {
    petriNetDefinition: {
      ...emptyNetFields,
      places: [
        {
          id: inputPlaceId,
          name: `${topicIdentifier}Input`,
          colorId: null,
          differentialEquationId: null,
          dynamicsEnabled: false,
          showAsInitialState: true,
          x: 0,
          y: 0,
        },
        {
          id: outputPlaceId,
          name: `${topicIdentifier}Draft`,
          colorId: null,
          differentialEquationId: null,
          dynamicsEnabled: false,
          x: 600,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "transition__mock-create-draft",
          name: `Draft${topicIdentifier}`,
          inputArcs: [{ placeId: inputPlaceId, type: "standard", weight: 1 }],
          outputArcs: [{ placeId: outputPlaceId, weight: 1 }],
          lambdaCode: "export default Lambda(() => true)",
          lambdaType: "predicate",
          transitionKernelCode: "export default TransitionKernel(() => ({}));",
          x: 300,
          y: 0,
        },
      ],
      scenarios: [
        {
          id: "scenario__mock-interview",
          name: "Mock interview result",
          description:
            "A deterministic placeholder proving the voice interview can hand a draft to Petrinaut.",
          initialState: {
            type: "per_place",
            content: {
              [inputPlaceId]: "1",
              [outputPlaceId]: "0",
            },
          },
          parameterOverrides: {},
          scenarioParameters: [],
        },
      ],
    },
    warnings: [
      "The mock projector did not receive a complete state-step-flow graph, so it created a clearly labelled placeholder net.",
    ],
  };
};

const createCapturedDraft = (
  captures: readonly InterviewCapture[],
): { petriNetDefinition: SDCPN; warnings: string[] } | null => {
  const stateCaptures = captures.filter(
    (capture) => capture.toolName === "record_process_state",
  );
  const stepCaptures = captures.filter(
    (capture) => capture.toolName === "record_process_step",
  );
  const flowCaptures = captures.filter(
    (capture) => capture.toolName === "record_process_flow",
  );

  const stateNames = [
    ...new Set(
      stateCaptures
        .map((capture) => stringProperty(capture.input, "name"))
        .filter((name): name is string => name !== null),
    ),
  ];
  const stepNames = [
    ...new Set(
      stepCaptures
        .map((capture) => stringProperty(capture.input, "name"))
        .filter((name): name is string => name !== null),
    ),
  ];
  if (stateNames.length === 0 || stepNames.length === 0) {
    return null;
  }

  const placeIdByName = new Map(
    stateNames.map((name, index) => [
      name.toLocaleLowerCase(),
      `place__mock-${index + 1}`,
    ]),
  );
  const transitionIdByName = new Map(
    stepNames.map((name, index) => [
      name.toLocaleLowerCase(),
      `transition__mock-${index + 1}`,
    ]),
  );
  const transitions: SDCPN["transitions"] = stepNames.map((name, index) => ({
    id: `transition__mock-${index + 1}`,
    name: identifierFrom(name, `Step${index + 1}`),
    inputArcs: [],
    outputArcs: [],
    lambdaCode: "export default Lambda(() => true)",
    lambdaType: "predicate",
    transitionKernelCode: "export default TransitionKernel(() => ({}));",
    x: 300 + index * 450,
    y: 0,
  }));

  let resolvedFlowCount = 0;
  for (const capture of flowCaptures) {
    const from = stringProperty(capture.input, "from")?.toLocaleLowerCase();
    const to = stringProperty(capture.input, "to")?.toLocaleLowerCase();
    if (!from || !to) {
      continue;
    }
    const fromPlaceId = placeIdByName.get(from);
    const toTransitionId = transitionIdByName.get(to);
    if (fromPlaceId && toTransitionId) {
      transitions
        .find((transition) => transition.id === toTransitionId)
        ?.inputArcs.push({
          placeId: fromPlaceId,
          type: "standard",
          weight: 1,
        });
      resolvedFlowCount += 1;
      continue;
    }
    const fromTransitionId = transitionIdByName.get(from);
    const toPlaceId = placeIdByName.get(to);
    if (fromTransitionId && toPlaceId) {
      transitions
        .find((transition) => transition.id === fromTransitionId)
        ?.outputArcs.push({ placeId: toPlaceId, weight: 1 });
      resolvedFlowCount += 1;
    }
  }
  if (resolvedFlowCount === 0) {
    return null;
  }

  const places: SDCPN["places"] = stateNames.map((name, index) => ({
    id: `place__mock-${index + 1}`,
    name: identifierFrom(name, `State${index + 1}`),
    colorId: null,
    differentialEquationId: null,
    dynamicsEnabled: false,
    showAsInitialState: index === 0,
    x: index * 450,
    y: index % 2 === 0 ? -180 : 180,
  }));
  const firstPlace = places[0];

  return {
    petriNetDefinition: {
      ...emptyNetFields,
      places,
      transitions,
      scenarios: firstPlace
        ? [
            {
              id: "scenario__mock-interview",
              name: "Mock interview result",
              description:
                "A draft projected from experiment-only process capture calls.",
              initialState: {
                type: "per_place",
                content: Object.fromEntries(
                  places.map((place) => [
                    place.id,
                    place.id === firstPlace.id ? "1" : "0",
                  ]),
                ),
              },
              parameterOverrides: {},
              scenarioParameters: [],
            },
          ]
        : [],
    },
    warnings: [
      "This net was generated by the mock projector and is not an authoritative Brunch projection.",
    ],
  };
};

export const createMockInterviewDraft = (
  input: FinalizeInterviewInput,
): InterviewDraftResult => {
  const title = titleFrom(input.transcript);
  const topic = title.replace(/ — mock draft$/u, "");
  const projected =
    createCapturedDraft(input.captures) ?? createFallbackDraft(topic);

  return {
    captures: structuredClone(input.captures),
    conversationId: input.conversationId,
    petriNetDefinition: projected.petriNetDefinition,
    revision: input.revision,
    source: "mock",
    title,
    transcript: structuredClone(input.transcript),
    warnings: projected.warnings,
  };
};

export const createMockInterviewProjection = (
  input: FinalizeInterviewInput,
): InterviewDraftResult | null => {
  const title = titleFrom(input.transcript);
  const projected =
    createCapturedDraft(input.captures) ??
    (input.readiness === "elicitor"
      ? createFallbackDraft(title.replace(/ — mock draft$/u, ""))
      : null);
  if (!projected) {
    return null;
  }

  return {
    captures: structuredClone(input.captures),
    conversationId: input.conversationId,
    petriNetDefinition: projected.petriNetDefinition,
    revision: input.revision,
    source: "mock",
    title,
    transcript: structuredClone(input.transcript),
    warnings: projected.warnings,
  };
};
