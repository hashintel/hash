import {
  type PetrinautDocName,
  petrinautDocNames,
} from "@hashintel/petrinaut-core";

import actualMode from "../../../../../../docs/actual-mode.md?raw";
import aiAssistant from "../../../../../../docs/ai-assistant.md?raw";
import drawingANet from "../../../../../../docs/drawing-a-net.md?raw";
import examples from "../../../../../../docs/examples.md?raw";
import experiments from "../../../../../../docs/experiments.md?raw";
import optimization from "../../../../../../docs/optimization.md?raw";
import petriNetExtensions from "../../../../../../docs/petri-net-extensions.md?raw";
import scenarios from "../../../../../../docs/scenarios.md?raw";
import simulation from "../../../../../../docs/simulation.md?raw";
import usefulPatterns from "../../../../../../docs/useful-patterns.md?raw";
import visualSettings from "../../../../../../docs/visual-settings.md?raw";

const htmlImagePattern = /<img\b[^>]*\/?>(?:\s*<\/img>)?/gi;
const markdownImagePattern = /!\[[^\]]*]\([^)]*\)/g;
// Collapse runs of blank lines left behind by image removal so the model
// doesn't see big empty gaps in the doc body.
const tripleBlankLinePattern = /\n{3,}/g;

export const stripImages = (markdown: string): string =>
  markdown
    .replace(htmlImagePattern, "")
    .replace(markdownImagePattern, "")
    .replace(tripleBlankLinePattern, "\n\n");

const rawDocsByName: Record<PetrinautDocName, string> = {
  "drawing-a-net": drawingANet,
  "petri-net-extensions": petriNetExtensions,
  "useful-patterns": usefulPatterns,
  simulation,
  scenarios,
  experiments,
  optimization,
  "actual-mode": actualMode,
  "ai-assistant": aiAssistant,
  "visual-settings": visualSettings,
  examples,
};

export const petrinautDocsContent: Record<PetrinautDocName, string> =
  Object.fromEntries(
    petrinautDocNames.map((name) => [name, stripImages(rawDocsByName[name])]),
  ) as Record<PetrinautDocName, string>;
