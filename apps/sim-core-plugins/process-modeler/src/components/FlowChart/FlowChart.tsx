import { useCallback, useEffect, useRef, useState } from "react";
import Modeler from "bpmn-js/lib/Modeler";
import PaletteProvider from "bpmn-js/lib/features/palette/PaletteProvider";

import CustomPalette from "../../lib/businessProcesses/PaletteProvider";
import { IconSettings } from "../IconSettings";
import { PropertiesPanel } from "../Properties/PropertiesPanel";
import { SettingsPanel } from "../Settings/SettingsPanel";
import {
  ChartError,
  validateChart,
} from "../../lib/businessProcesses/validateChart";
import {
  behaviorVersion,
  elementsToProcessAgent,
} from "../../lib/businessProcesses/elementsToProcessAgent";
import { analysisData } from "../../lib/analysisData";
import { creatorAgentSource } from "../../lib/creatorAgentSource";
import { diagramStarterString } from "../../lib/diagram";

import "./FlowChart.css";
import "./diagram-js.css";
import { BpmnElement, isRoot } from "../../types/bpmnElements";
import { getPropertyValue } from "../../lib/getPropertyValue";

const _getPaletteEntries = CustomPalette.prototype.getPaletteEntries;
PaletteProvider.prototype.getPaletteEntries = function (this) {
  const tools = _getPaletteEntries.apply(this);
  return tools;
};

export const FlowChart = () => {
  const [error, setError] = useState<string>("");
  const [updatingExisting, setUpdatingExisting] = useState(false);
  const [modeler, setModeler] = useState<any>(null);
  const [resourceOptions, setResourceOptions] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [storageKey, setStorageKey] = useState<string | undefined>(undefined);
  const [takenProcessNames, setTakenProcessNames] = useState<string[]>([]);
  const lastKeyLoaded = useRef<string | undefined>(undefined);
  const coreHandlingDrafts = useRef<boolean>(false);

  // Error display
  let errorTimeout: ReturnType<typeof setTimeout> | undefined;
  const showError = ({ element, message, propertyName }: ChartError) => {
    if (errorTimeout) {
      clearTimeout(errorTimeout);
    }
    setError(message);
    const selector = modeler.get("selection");
    selector.select(element);
    if (propertyName) {
      setTimeout(() => document.getElementById(propertyName)?.focus(), 200);
    }
    errorTimeout = setTimeout(() => setError(""), 4000);
  };

  // Handle chart initialization messages from hCore
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data.type === "setProject" && event.data.value) {
        const key = event.data.value;

        if (event.data.initialBpmn) {
          importXml(modeler, event.data.initialBpmn);
          localStorage.setItem(key, event.data.initialBpmn);
        } else {
          importXml(modeler, diagramStarterString);
        }

        if (event.data.takenProcessNames) {
          setTakenProcessNames(event.data.takenProcessNames);
        }
        if (event.data.existingProcess) {
          setUpdatingExisting(true);
        } else {
          setUpdatingExisting(false);
        }

        if (event.data.coreHandlingDrafts) {
          coreHandlingDrafts.current = true;
        }
        setStorageKey(event.data.value);
        setShowSettings(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  });

  const saveToLocalStorage = useCallback(() => {
    modeler?.saveXML({ format: true }).then(({ xml }: { xml: string }) => {
      // send the updated draft to hCore
      window.parent.postMessage(
        {
          type: "setBpmnDraft",
          bpmnDraft: xml,
        },
        "*",
      );

      // Legacy provision for storing local drafts
      if (
        !coreHandlingDrafts.current &&
        storageKey &&
        storageKey === lastKeyLoaded.current
      ) {
        try {
          window.localStorage?.setItem(storageKey, xml);
        } catch (err) {
          // localStorage is unavailable / blocked
        }
      }
    });
  }, [modeler, storageKey]);
  window.addEventListener("unload", saveToLocalStorage);

  // Load a diagram into the modeler
  const importXml = (modeler: any, diagramToImport: string) => {
    modeler?.importXML(diagramToImport).then(() => {
      // The one value we need to handle specially are the resources
      // We change their format for consumption by PropertiesPanel
      const registry = modeler.get("elementRegistry");
      const elements = registry.getAll() as BpmnElement[];
      const root = elements.find((element) => isRoot(element));
      if (root) {
        const resources = getPropertyValue(root, "process_resources");
        if (resources) {
          setResourceOptions(Object.keys(JSON.parse(resources)));
        }
      }
    });
  };

  // Initialization and loading from localStorage
  useEffect(() => {
    if (modeler && storageKey && storageKey === lastKeyLoaded.current) {
      return;
    }
    let newModeler: any;
    if (!modeler) {
      newModeler = new Modeler({
        container: ".FlowChart__canvas",
        keyboard: {
          bindTo: document,
        },
        bpmnRenderer: {
          defaultFillColor: "#3D8AFF",
          defaultStrokeColor: "#fefefe",
        },
      });
      setModeler(newModeler);
    }

    let diagramToImport = diagramStarterString;
    if (storageKey) {
      try {
        // if we have been sent a project ref, use it to retrieve the draft
        const saved = window.localStorage?.getItem(storageKey);
        diagramToImport = saved ? saved : diagramToImport;

        // If hCore is taking over handling of drafts, remove the saved one
        if (coreHandlingDrafts.current) {
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        // localStorage is unavailable / blocked
      }
      lastKeyLoaded.current = storageKey;
    }

    importXml(newModeler || modeler, diagramToImport);

    const interval = setInterval(saveToLocalStorage, 1000);

    return () => clearInterval(interval);
  }, [modeler, saveToLocalStorage, storageKey]);

  // Validate, construct agent, and submit to hCore
  const updateCore = () => {
    setError("");
    const registry = modeler.get("elementRegistry");
    const elements = registry.getAll() as BpmnElement[];
    const errors = validateChart(elements);
    const now = new Date().valueOf();

    if (errors.length) {
      showError(errors[0]);
      return;
    } else {
      const agent = elementsToProcessAgent(elements);
      const root = elements.find((element) => isRoot(element));
      const chartName = getPropertyValue(root!, "process_name");
      agent.agent_name = chartName?.toLowerCase() || "process";

      if (takenProcessNames.includes(agent.agent_name)) {
        showError({
          message: `Process name '${agent.agent_name}' already exists in your project`,
        });
        setShowSettings(true);
        return;
      }

      const createAgentPayload = {
        id: `${now}-create`,
        contents: creatorAgentSource(agent),
        file: `create_${agent.agent_name}.js`,
        type: "upsertCreatorAgent",
      };
      // eslint-disable-next-line no-restricted-globals
      parent.window.postMessage(createAgentPayload, "*");

      const dependencies = agent.behaviors.reduce((object, name) => {
        object[name] = behaviorVersion(name);
        return object;
      }, {} as { [key: string]: string });
      const addDependenciesPayload = {
        id: `${now}-dependencies`,
        contents: dependencies,
        type: "addDependencies",
      };
      // eslint-disable-next-line no-restricted-globals
      parent.window.postMessage(addDependenciesPayload, "*");

      const analysisJson = analysisData(elements);
      if (analysisJson.outputs.length || analysisJson.plots.length) {
        const analysisPayload = {
          id: `${now}-analysis`,
          contents: analysisJson,
          type: "updateAnalysis",
        };
        // eslint-disable-next-line no-restricted-globals
        parent.window.postMessage(analysisPayload, "*");
      }

      modeler.saveXML({ format: true }).then(({ xml }: { xml: string }) => {
        // eslint-disable-next-line no-restricted-globals
        parent.window.postMessage(
          {
            contents: xml,
            processName: agent.agent_name,
            type: "commitBpmnFile",
          },
          "*",
        );
      });

      saveToLocalStorage();
    }
  };

  return (
    <div className="FlowChart">
      {error && (
        <div className="FlowChart__error">
          <span className="red-text">ERROR: </span>
          {error}
        </div>
      )}
      <div className="FlowChart__canvas" />
      <div className="FlowChart__sidebar">
        <span
          onClick={() => setShowSettings(!showSettings)}
          style={{ display: "flex", alignItems: "center" }}
        >
          <IconSettings />
        </span>
        <button className="FlowChart__save-button" onClick={updateCore}>
          {updatingExisting ? "Update process" : "Add to model"}
        </button>
      </div>
      {modeler && (
        <PropertiesPanel modeler={modeler} resourceOptions={resourceOptions} />
      )}
      {showSettings && modeler && (
        <SettingsPanel
          modeler={modeler}
          setResourceOptions={setResourceOptions}
          updatingExisting={updatingExisting}
        />
      )}
    </div>
  );
};
