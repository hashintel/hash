import Draggable from "react-draggable";
import { FC, useState } from "react";

import { PropertyInput } from "./PropertyInput";
import { BpmnElement, elementType } from "../../types/bpmnElements";
import {
  propertyDefinitions,
  PropertyValue,
} from "../../lib/businessProcesses/propertyDefinitions";

import "./PropertiesPanel.css";
import { getPropertyValue } from "../../lib/getPropertyValue";
import { IconHelpCircle } from "../IconHelpCircle";

type PropertiesPanelProps = {
  modeler: any;
  resourceOptions: string[];
};

export const docsBaseLink =
  "https://docs.hash.ai/core/concepts/designing-with-process-models/";

export const PropertiesPanel: FC<PropertiesPanelProps> = ({
  modeler,
  resourceOptions,
}) => {
  const [element, setElement] = useState<BpmnElement | null>(null);
  const [selectedElements, setSelectedElements] = useState<BpmnElement[]>([]);

  modeler.on(
    "selection.changed",
    ({
      newSelection,
    }: {
      oldSelection: BpmnElement[];
      newSelection: BpmnElement[];
    }) => {
      setSelectedElements(newSelection);
      if (newSelection[0]?.id !== element?.id) {
        setElement(newSelection[0]);
      }
    },
  );

  modeler.on(
    "element.changed",
    ({ element: newElement }: { element: BpmnElement }) => {
      if (newElement?.type !== "bpmn:Process") {
        setElement(newElement);
      }
    },
  );

  if (!element || selectedElements.length > 1) {
    return null;
  }

  const { docRef, properties } = propertyDefinitions(element) ?? {};

  const updatePropertyValue = (
    element: BpmnElement,
    propertyName: string,
    value: PropertyValue,
  ) => {
    const modeling = modeler.get("modeling");
    if (propertyName === "name") {
      modeling.updateLabel(element, value);
    } else {
      modeling.updateProperties(element, {
        [propertyName]: value,
      });
    }
  };

  if (!properties) {
    return null;
  }

  return (
    <Draggable cancel=".PropertyInput__input">
      <div className="Panel PropertiesPanel">
        <h3>
          {elementType(element)}
          <a href={`${docsBaseLink}${docRef}`} target="_blank">
            <IconHelpCircle />
          </a>
        </h3>
        {properties.map((property) => (
          <PropertyInput
            key={`${element.id}-${property.name}`}
            property={property}
            resourceOptions={resourceOptions}
            value={getPropertyValue(element, property.name)}
            updateProperty={(value) =>
              updatePropertyValue(element, property.name, value)
            }
          />
        ))}
      </div>
    </Draggable>
  );
};
