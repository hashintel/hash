import { experimentalIconNames, petriconHints } from "./experimental-icons";

import type { ExperimentalIconName } from "./experimental-icons";

export {
  ExperimentalIcon as Petricon,
  ExperimentalIconProvider as PetriconProvider,
  experimentalIconNames as petriconNames,
  experimentalIconPack as petriconPack,
  experimentalIconEffects as petriconEffects,
  getExperimentalIconEffects as getPetriconEffects,
  useExperimentalIconMotionAllowed as usePetriconMotionAllowed,
} from "./experimental-icons";
export type {
  ExperimentalIconName as PetriconName,
  ExperimentalIconProps as PetriconProps,
  ExperimentalIconDefaults as PetriconDefaults,
  ExperimentalIconStatus as PetriconStatus,
  ExperimentalIconEffect as PetriconEffect,
  ExperimentalIconMotion as PetriconMotion,
  ExperimentalIconChoreography as PetriconChoreography,
  ExperimentalIconBadgeVisibility as PetriconBadgeVisibility,
  ExperimentalIconTransition as PetriconTransition,
  ExperimentalIconVariant as PetriconVariant,
} from "./experimental-icons";

export const petriconStudies = [
  {
    concept: "Differential equations",
    category: "Modeling",
    names: ["differentialEquation", "equationCurve", "equationFlow"],
    variants: ["Rate of change", "Solution curve", "Slope field"],
    motion:
      "The derivative opens, a solution evolves, and the field bends around its trajectory.",
  },
  {
    concept: "Parameters",
    category: "Modeling",
    names: ["parameter", "parameterDial", "parameterRange"],
    variants: ["Sliders", "Calibration dial", "Value bounds"],
    motion:
      "Knobs scrub, the dial adjusts, and bounds narrow, then return to their initial values.",
  },
  {
    concept: "Variables",
    category: "Modeling",
    names: ["variable", "variableBrackets", "variableRegister"],
    variants: ["A changing value", "Bound expression", "Value register"],
    motion:
      "The value flexes or shifts inside a stable container; the register cursor responds.",
  },
  {
    concept: "Token types",
    category: "Modeling",
    names: ["tokenType", "tokenTypeStack", "tokenTypeTag"],
    variants: ["Token family", "Typed collection", "Type label"],
    motion:
      "Tokens gather, a collection separates, or a token responds inside its label.",
  },
  {
    concept: "Subnets",
    category: "Modeling",
    names: ["cube", "subnetNetwork", "subnetLayers"],
    variants: ["Spatial module", "Contained net", "Nested modules"],
    motion:
      "The cube turns in depth with hidden edges removed. Connections trace and nested modules separate.",
  },
  {
    concept: "Summation",
    category: "Math",
    names: ["sum", "sumRange"],
    variants: ["A single operator", "An operator with bounds"],
    motion: "The notation makes a small writing gesture.",
  },
  {
    concept: "Integration",
    category: "Math",
    names: ["integral", "integralBounds"],
    variants: ["A continuous integral", "A bounded interval"],
    motion: "The curve shifts as its bounds open.",
  },
  {
    concept: "Matrix",
    category: "Math",
    names: ["matrix", "matrixGrid"],
    variants: ["Individual values", "Rows of values"],
    motion: "Values respond inside a steady frame.",
  },
  {
    concept: "Probability",
    category: "Math",
    names: ["probability", "probabilityDice"],
    variants: ["A distribution", "A discrete outcome"],
    motion: "The distribution sways; the dice values pulse.",
  },
  {
    concept: "Expression",
    category: "Code",
    names: ["expression", "expressionTree"],
    variants: ["Inline syntax", "A syntax tree"],
    motion: "Brackets open; the root node responds.",
  },
  {
    concept: "Type",
    category: "Code",
    names: ["typeVariable", "typeUnion"],
    variants: ["A type variable", "A choice of types"],
    motion: "A small writing gesture or two separating choices.",
  },
  {
    concept: "Breakpoint",
    category: "Code",
    names: ["breakpoint", "breakpointLine"],
    variants: ["An execution stop", "A stop on a code line"],
    motion: "The stop marker draws inward.",
  },
  {
    concept: "Test",
    category: "Code",
    names: ["testTube", "testCheck"],
    variants: ["An experiment", "A validation result"],
    motion: "The liquid shifts and the result gives a short pulse.",
  },
  {
    concept: "Agent",
    category: "AI",
    names: ["agent", "agentOrbit"],
    variants: ["A helpful robot", "An autonomous process"],
    motion: "The robot blinks; the orbit turns and settles.",
  },
  {
    concept: "Context",
    category: "AI",
    names: ["context", "contextWindow"],
    variants: ["Supporting documents", "A context window"],
    motion: "Pages separate; the context window opens.",
  },
  {
    concept: "Reasoning",
    category: "AI",
    names: ["reasoning", "reasoningFork"],
    variants: ["Sequential steps", "Alternative paths"],
    motion: "A signal passes between connected steps.",
  },
  {
    concept: "Embedding",
    category: "AI",
    names: ["embedding", "embeddingVector"],
    variants: ["A space of values", "A vector in that space"],
    motion: "Values pulse; the vector moves in its direction.",
  },
] as const satisfies readonly {
  concept: string;
  category: string;
  names: readonly ExperimentalIconName[];
  variants: readonly string[];
  motion: string;
}[];

const categories = {
  Navigation: [
    "arrowUp",
    "arrowDown",
    "arrowLeft",
    "arrowRight",
    "arrowUpRight",
    "arrowsLeftRight",
    "arrowTrendUp",
    "arrowTrendDown",
    "chevronUp",
    "chevronDown",
    "chevronLeft",
    "chevronRight",
    "externalLink",
    "rightToLine",
    "sidebar",
    "menu",
    "collapse",
    "inputPipe",
  ],
  Editing: [
    "hand",
    "cursor",
    "shapes",
    "pencil",
    "copy",
    "trash",
    "plus",
    "minus",
    "close",
    "check",
    "search",
    "zoomIn",
    "zoomOut",
    "fitView",
    "parameter",
    "filter",
    "sortUp",
    "sortDown",
    "sortUpAZ",
    "sortDownAZ",
    "ruler",
    "gripVertical",
  ],
  Simulation: [
    "flask",
    "layer",
    "place",
    "transition",
    "addPlace",
    "addTransition",
    "tokenType",
    "play",
    "pause",
    "playback",
    "stepForward",
    "stop",
    "reset",
    "diagnostics",
    "chartLine",
    "chartBarSimple",
    "clock",
    "clockRotateLeft",
    "microscope",
    "bullseye",
  ],
  Math: [
    "infinity",
    "lambda",
    "function",
    "emptySet",
    "asterisk",
    "oneHundred",
    "circleOne",
  ],
  Code: [
    "code",
    "bracketsCurly",
    "bracketsSquare",
    "terminal",
    "bug",
    "diagramNested",
    "diagramProject",
    "diagramNodes",
    "diagramSubtask",
  ],
  AI: [
    "assistant",
    "agent",
    "sparkles",
    "magic",
    "lightbulbOn",
    "thoughtBubble",
    "microphone",
    "voice",
    "transcription",
  ],
} satisfies Record<string, readonly ExperimentalIconName[]>;

export const petriconCatalog = experimentalIconNames.map((name) => {
  const study = petriconStudies.find((candidate) =>
    candidate.names.some((variant) => variant === name),
  );
  const category =
    study?.category ??
    Object.entries(categories).find(([, names]) =>
      (names as readonly string[]).includes(name),
    )?.[0] ??
    "Interface";
  const words = name.replace(/([A-Z])/g, " $1");
  return {
    name,
    label: words.charAt(0).toUpperCase() + words.slice(1),
    category,
    motion: petriconHints[name],
    study: study?.concept,
  };
});
