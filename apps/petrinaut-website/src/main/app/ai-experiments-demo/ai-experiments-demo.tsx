import { useState } from "react";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";
import {
  definePetrinautPlugin,
  Petrinaut,
  type PluginHook,
} from "@hashintel/petrinaut/ui";

import { BrowserOptimizationProvider } from "../optimization-demo/browser-optimization-provider";
import { AssistantChat } from "../plugins/_shared/chat/assistant-chat";
import { createExperimentDemoTransport } from "./create-experiment-demo-transport";

import type { PetrinautAiMessage } from "../plugins/_shared/chat/ai-message";

const introduction: PetrinautAiMessage[] = [
  {
    id: "experiment-demo-introduction",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Let's explore an illustrative outbreak model. Ask how to compare its runs or search different starting infection levels.",
      },
    ],
  },
];

const createDemoAssistantPlugin = definePetrinautPlugin({
  id: "website.ai-experiments-demo",
  name: "Demo assistant",
  description: "A scripted conversation that runs real experiments.",
  author: "HASH",
  access: { document: "write", experiments: "write" },
  assistant: { label: "Demo" },
});

const demoTransport = createExperimentDemoTransport();

const useDemoAssistantPlugin: PluginHook<typeof createDemoAssistantPlugin> = (
  api,
) => ({
  assistant: {
    view: (
      <AssistantChat
        api={api}
        conversationId="ai-experiments-demo"
        messages={introduction}
        transport={demoTransport}
      />
    ),
  },
});

/** A scripted assistant whose conversation runs real experiments. */
export const aiExperimentsDemoPlugin = createDemoAssistantPlugin(
  useDemoAssistantPlugin,
);

export const AiExperimentsDemo = () => {
  const [handle] = useState(() =>
    createJsonDocHandle({
      id: "ai-experiments-demo",
      initial: structuredClone(sirModel.petriNetDefinition),
    }),
  );

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
            plugins={[aiExperimentsDemoPlugin]}
          />
        </BrowserOptimizationProvider>
      </div>
    </main>
  );
};
