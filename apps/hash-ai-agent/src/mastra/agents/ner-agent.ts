import { Agent } from "@mastra/core/agent";

import { DEFAULT_MODEL } from "../constants";

export const nerAgent = new Agent({
  id: "ner-agent",
  name: "Named Entity Recognition Agent",
  instructions: [
    "You are an expert interpreter of textual semantics.",
    "You specialize in identifying and classifying named entities within texts.",
  ],
  model: DEFAULT_MODEL,
});
