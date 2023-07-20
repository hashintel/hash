import Draggable from "react-draggable";
import { FC, FormEvent, useEffect, useState } from "react";

import { BpmnElement, isRoot } from "../../types/bpmnElements";
import { PropertyValue } from "../../lib/businessProcesses/propertyDefinitions";

import "./SettingsPanel.css";
import { getPropertyValue } from "../../lib/getPropertyValue";
import { IconHelpCircle } from "../IconHelpCircle";
import { Tooltip } from "../Tooltip";

type SettingsPanelProps = {
  modeler: any;
  setResourceOptions: (options: string[]) => void;
  updatingExisting?: boolean;
};

const docsBaseLink =
  "https://docs.hash.ai/core/concepts/designing-with-process-models/";

export const SettingsPanel: FC<SettingsPanelProps> = ({
  modeler,
  setResourceOptions,
  updatingExisting,
}) => {
  const [name, setName] = useState<string>("");
  const [resources, setResources] = useState<[string, number][]>([["", 1]]);
  const [root, setRoot] = useState<BpmnElement | null>(null);

  const updatePropertyValue = (
    element: BpmnElement,
    propertyName: string,
    value: PropertyValue,
  ) => {
    const modeling = modeler.get("modeling");
    modeling.updateProperties(element, {
      [propertyName]: value,
    });
  };
  const updateName = (e: FormEvent) => {
    e.preventDefault();
    if (root) {
      updatePropertyValue(root, "process_name", name);
    }
  };

  const updateResources = () => {
    if (!root) return;
    const validResources = resources.filter(
      ([key, value]) => key && value != null,
    );
    updatePropertyValue(
      root,
      "process_resources",
      JSON.stringify(Object.fromEntries(validResources)),
    );
    setResourceOptions(validResources.map(([key]) => key));
  };

  const setDraftResources = (key: string, value: number, index: number) => {
    setResources((resources) =>
      resources.map((currentValue, currentIndex) =>
        index === currentIndex ? [key, value] : currentValue,
      ),
    );
  };
  const addDraftResource = () => {
    setResources((resources) => [...resources, ["", 1]]);
  };

  useEffect(() => {
    const registry = modeler.get("elementRegistry");
    const elements = registry.getAll() as BpmnElement[];
    const root = elements.find((element) => isRoot(element));
    if (!root) {
      return;
    }
    const name = getPropertyValue(root, "process_name");
    setName(name || "Process");

    const resources = getPropertyValue(root, "process_resources");
    setResources(resources ? Object.entries(JSON.parse(resources)) : [["", 1]]);

    setRoot(root);
  }, [modeler]);

  return (
    <Draggable cancel=".PropertyInput__input">
      <div className="Panel SettingsPanel">
        <h3>
          Settings
          <a
            href={`${docsBaseLink}structuring-a-process-model#resources`}
            target="_blank"
          >
            <IconHelpCircle />
          </a>
        </h3>
        <form className="PropertyInput" onSubmit={updateName}>
          <label className="PropertyInput__label" htmlFor={"root-name"}>
            Process Name
            <Tooltip text={"Give your chart a name to identify it by"} />
          </label>
          <input
            className="PropertyInput__input PropertyInput__input--text"
            disabled={updatingExisting}
            id={name}
            onBlur={updateName}
            onChange={(e) => setName(e.target.value.replace(/ /g, ""))}
            type="text"
            value={name}
          />
        </form>
        <div className="PropertyInput" onSubmit={updateResources}>
          <label className="PropertyInput__label" htmlFor={"root-name"}>
            Resources
            <Tooltip
              text={
                "Define resource fields to initiate your agent with, and max/starting value. These are seized and released in other blocks."
              }
            />
          </label>
          <div className="PropertyInput__resources">
            {resources.map(([key, value], index) => (
              <div className="PropertyInput__resource" key={index}>
                <input
                  className="PropertyInput__input PropertyInput__input--text"
                  onBlur={updateResources}
                  onChange={(e) =>
                    setDraftResources(e.target.value, value, index)
                  }
                  placeholder="Resource name"
                  type="text"
                  value={key}
                />
                <input
                  className="PropertyInput__input PropertyInput__input--number"
                  min={0}
                  onBlur={updateResources}
                  onChange={(e) =>
                    setDraftResources(key, parseInt(e.target.value), index)
                  }
                  step={1}
                  type="number"
                  value={value}
                />
              </div>
            ))}
            <button onClick={addDraftResource}>Add Resource</button>
          </div>
        </div>
      </div>
    </Draggable>
  );
};
