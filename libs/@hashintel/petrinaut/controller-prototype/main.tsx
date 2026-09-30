import "../src/ui/index.css";
import { createRoot } from "react-dom/client";

import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import {
  demoControllers,
  withControllers,
} from "../src/ui/controller-prototype/scheduler-example";
import {
  setFieldsView,
  useFieldsView,
} from "../src/ui/controller-prototype/fields-view-flag";
import { PetrinautStoryProvider } from "../src/ui/petrinaut-story-provider";

const params = new URLSearchParams(location.search);

const FIELDS_VIEW_KEY = "controllerPrototype.fieldsView";

const storedFieldsView = (): boolean => {
  try {
    return localStorage.getItem(FIELDS_VIEW_KEY) === "1";
  } catch {
    return false;
  }
};

setFieldsView(params.has("fields") || storedFieldsView());

const FieldsViewPill = () => {
  const on = useFieldsView();
  return (
    <label
      style={{
        position: "fixed",
        left: 296,
        bottom: 16,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: "white",
        border: "1px solid rgba(0, 0, 0, 0.15)",
        font: "12px system-ui, sans-serif",
        color: "#404040",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => {
          setFieldsView(event.target.checked);
          try {
            localStorage.setItem(
              FIELDS_VIEW_KEY,
              event.target.checked ? "1" : "0"
            );
          } catch {
            // The choice still applies for this page view.
          }
        }}
      />
      Try: Fields view in Transition Results
    </label>
  );
};

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
          : withControllers(
              supplyChainWithDisruption.petriNetDefinition,
              demoControllers
            )
      }
    />
    <FieldsViewPill />
  </div>
);

createRoot(document.getElementById("root")!).render(<App />);
