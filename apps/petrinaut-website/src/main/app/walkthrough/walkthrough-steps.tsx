// Videos must fill their 16:9 frame edge-to-edge. Avoid card-inside-the-card
// framing (i.e. don't include a nested chrome window around the actual UI) —
// the dialog already provides its own container.
import introVideo from "./videos/01-intro-example.mp4";
import experimentsVideo from "./videos/02-experiments-example.mp4";
import aiVideo from "./videos/03-ai-example.mp4";

import type { WalkthroughStep } from "@hashintel/petrinaut/ui";

export const walkthroughSteps: WalkthroughStep[] = [
  {
    id: "welcome",
    title: "Welcome to Petrinaut",
    body: (
      <>
        <p>
          <strong>Petrinaut</strong> is a workshop for building, simulating, and
          analyzing Petri nets: a mathematical formalism for modelling
          distributed systems.
        </p>
        <p>
          People use it to analyze supply chains, workflows, chemical reactions,
          epidemics, network protocols — anywhere multiple things happen at once
          and influence each other.
        </p>
      </>
    ),
    videoHref: introVideo,
    videoAlt: "The Petrinaut editor with an example net on the canvas",
  },
  {
    id: "simulate",
    title: "Simulate, experiment, and query your model",
    body: (
      <>
        <p>
          With your system modelled as a Petri net, you can explore and optimise
          outcomes across different scenarios — for example, the failure rate of
          a manufacturing line, or the throughput of a queueing system.
        </p>
        <p>
          <strong>Petrinaut</strong> lets you run experiments on complex
          probabilistic processes and build custom metrics to inspect the
          results.
        </p>
      </>
    ),
    videoHref: experimentsVideo,
    videoAlt: "Simulation view showing experiment results and a chart",
  },
  {
    id: "build",
    title: "Build your first model",
    body: (
      <>
        <p>
          To build your first model, use the drag-and-drop canvas or ask the AI
          assistant to build one for you.
        </p>
        <p>
          Describe what you want to simulate and the assistant edits your net
          directly — adding places and transitions, writing custom firing rules,
          and fixing errors as you iterate.
        </p>
      </>
    ),
    videoHref: aiVideo,
    videoAlt:
      "Canvas alongside the AI assistant panel mid-conversation editing the net",
  },
];
