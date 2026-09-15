import { useState } from "react";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";
import { Petrinaut, type PetrinautAiMessage } from "@hashintel/petrinaut/ui";

import { BrowserOptimizationProvider } from "../optimization-demo/browser-optimization-provider";
import { createExperimentDemoTransport } from "./create-experiment-demo-transport";

const introduction: PetrinautAiMessage[] = [
  {
    id: "experiment-demo-introduction",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Let's explore an illustrative outbreak model. Ask how to compare its runs or search different starting infection levels.\n\nFor optimization, enable **Parameter sweeps** and **In-browser optimization** in Settings → Simulation.",
      },
    ],
  },
];

export const AiExperimentsDemo = () => {
  const [handle] = useState(() =>
    createJsonDocHandle({
      id: "ai-experiments-demo",
      initial: structuredClone(sirModel.petriNetDefinition),
    }),
  );
  const [transport] = useState(createExperimentDemoTransport);

  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "12px 20px",
          background: "#eaf5ff",
          color: "#174368",
          fontSize: 14,
          fontFamily: "Inter Variable, system-ui, sans-serif",
        }}
      >
        <strong>SIR model demo.</strong> Scripted conversation · live simulation
        results.
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <BrowserOptimizationProvider>
          <Petrinaut
            handle={handle}
            title="Outbreak experiments"
            hideNetManagementControls="except-title"
            aiAssistant={{
              conversationId: "ai-experiments-demo",
              messages: introduction,
              transport,
            }}
          />
        </BrowserOptimizationProvider>
      </div>
    </main>
  );
};
