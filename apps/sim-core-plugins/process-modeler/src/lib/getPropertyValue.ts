import { BpmnElement } from "../types/bpmnElements";
import { ParameterName } from "../types/properties";

export const getPropertyValue = (
  element: BpmnElement,
  propertyName: ParameterName,
) => {
  if (propertyName === "name") {
    return element.businessObject.name;
  }
  return element.businessObject.get(propertyName);
};
