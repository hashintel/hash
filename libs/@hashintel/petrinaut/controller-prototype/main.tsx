import "../src/ui/index.css";
import { createRoot } from "react-dom/client";

import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import {
  demoConstraints,
  demoControllers,
  withConstraints,
  withControllers,
  withNeutralBatchColor,
} from "../src/ui/controller-prototype/scheduler-example";
import { PetrinautStoryProvider } from "../src/ui/petrinaut-story-provider";

const params = new URLSearchParams(location.search);

/**
 * The controller prototype on its own page, without Storybook. `?readonly`
 * opens it read-only; `?empty` starts with no controllers and no constraints.
 */
const App = () => (
  <div style={{ height: "100vh", width: "100vw" }}>
    <PetrinautStoryProvider
      readonly={params.has("readonly")}
      initialTitle={supplyChainWithDisruption.title}
      initialDefinition={withNeutralBatchColor(
        params.has("empty")
          ? supplyChainWithDisruption.petriNetDefinition
          : withConstraints(
              withControllers(
                supplyChainWithDisruption.petriNetDefinition,
                demoControllers
              ),
              demoConstraints
            )
      )}
    />
  </div>
);

createRoot(document.getElementById("root")!).render(<App />);
