import "../src/ui/index.css";
import { createRoot } from "react-dom/client";

import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import {
  scheduler,
  withControllers,
} from "../src/ui/controller-prototype/scheduler-example";
import { PetrinautStoryProvider } from "../src/ui/petrinaut-story-provider";

const params = new URLSearchParams(location.search);

/**
 * The controller prototype on its own page, without Storybook. `?readonly`
 * opens it read-only; `?empty` starts with no controllers.
 */
const App = () => (
  <div style={{ height: "100vh", width: "100vw" }}>
    <PetrinautStoryProvider
      readonly={params.has("readonly")}
      initialTitle={supplyChainWithDisruption.title}
      initialDefinition={
        params.has("empty")
          ? supplyChainWithDisruption.petriNetDefinition
          : withControllers(supplyChainWithDisruption.petriNetDefinition, [
              scheduler,
            ])
      }
    />
  </div>
);

createRoot(document.getElementById("root")!).render(<App />);
