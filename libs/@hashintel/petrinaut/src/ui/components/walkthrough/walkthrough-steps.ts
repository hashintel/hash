// Screenshots are currently placeholder SVGs. When replacing with real
// product captures, follow this framing rule: each image must fill its 16:9
// frame edge-to-edge. Avoid card-inside-the-card framing (i.e. don't include
// a nested chrome window around the actual UI) — the dialog already provides
// its own container.
import welcomeImg from "./screenshots/01-welcome.svg";
import simulateImg from "./screenshots/02-simulate.svg";
import buildImg from "./screenshots/03-build.svg";

export type WalkthroughStep = {
  id: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
};

export const walkthroughSteps: WalkthroughStep[] = [
  {
    id: "welcome",
    title: "Welcome to Petrinaut",
    body:
      "Petrinaut is a workshop for building, simulating, and analyzing " +
      "Petri-nets: a formal modelling framework for simulating distributed " +
      "systems. People use it for workflows, queues, chemical reactions, " +
      "epidemics, populations, orbital mechanics — anywhere multiple things " +
      "happen at once and influence each other.",
    image: welcomeImg,
    imageAlt: "The Petrinaut editor with an example net on the canvas",
  },
  {
    id: "simulate",
    title: "Simulate, experiment, and query your model",
    body:
      "With your system modelled as a Petri net, you can run monte-carlo " +
      "simulations and query data about it — for example, the failure rate " +
      "of a manufacturing line, or the throughput of a queueing system. " +
      "Petrinaut lets you build custom scenarios and experiments, and then " +
      "visualize and query custom metrics across runs.",
    image: simulateImg,
    imageAlt: "Simulation view showing experiment results and a chart",
  },
  {
    id: "build",
    title: "Build your first model",
    body:
      "To build your first model, use the drag-and-drop canvas, keyboard " +
      "shortcuts, or ask the AI assistant to build one for you. Describe " +
      "what you want and the assistant edits your net directly — adding " +
      "places and transitions, writing custom firing rules, and fixing " +
      "errors as you iterate.",
    image: buildImg,
    imageAlt:
      "Canvas alongside the AI assistant panel mid-conversation editing the net",
  },
];
