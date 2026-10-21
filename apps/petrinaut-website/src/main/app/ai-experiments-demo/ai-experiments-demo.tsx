import { useState } from "react";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";
import { Petrinaut } from "@hashintel/petrinaut/ui";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import { BrowserOptimizationProvider } from "../optimization-demo/browser-optimization-provider";
import { AssistantChat } from "../plugins/petrinaut-ai/chat/assistant-chat";
import { createExperimentDemoTransport } from "./create-experiment-demo-transport";

import type { PetrinautAiMessage } from "../plugins/petrinaut-ai/chat/ai-message";

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

const DemoAssistantPlugin = definePetrinautPlugin({
  id: "website.ai-experiments-demo",
  name: "Demo assistant",
  description: "A scripted conversation that runs real experiments.",
  author: "HASH",
  access: { document: "write", experiments: "write", editor: "write" },
  assistant: true,
});

const useDemoAssistantPlugin: PluginHook<typeof DemoAssistantPlugin> = (
  api,
) => {
  const [transport] = useState(createExperimentDemoTransport);

  return {
    assistant: {
      content: (
        <AssistantChat
          api={api}
          messages={introduction}
          transport={transport}
        />
      ),
    },
  };
};

/** A scripted assistant whose conversation runs real experiments. */
const aiExperimentsDemoPlugin = DemoAssistantPlugin(useDemoAssistantPlugin);

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
