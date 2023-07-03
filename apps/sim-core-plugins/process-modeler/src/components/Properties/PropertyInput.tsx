import { FC, FormEvent, useEffect, useState } from "react";

import {
  PropertyDefinition,
  PropertyValue,
} from "../../lib/businessProcesses/propertyDefinitions";
import { Tooltip } from "../Tooltip";

type PropertyInputProps = {
  property: PropertyDefinition;
  resourceOptions: string[];
  updateProperty: (value: PropertyValue) => void;
  value: PropertyValue;
};

export const PropertyInput: FC<PropertyInputProps> = ({
  property,
  resourceOptions,
  updateProperty,
  value,
}) => {
  const { description, name, required, type } = property;

  const defaultValue = value ?? "";
  const [draftValue, setDraftValue] = useState<PropertyValue | undefined>(
    defaultValue,
  );

  useEffect(() => setDraftValue(value ?? ""), [value]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draftValue != null) {
      updateProperty(draftValue);
    }
  };

  let InputElement;

  switch (property.type) {
    case "string":
      if (name === "resource") {
        InputElement = (
          <select
            className="PropertyInput__input PropertyInput__input--text"
            id={name}
            onChange={(e) => {
              /** @todo fix this to get new values through into state properly */
              setDraftValue(e.target.value);
              updateProperty(e.target.value);
            }}
            required={required}
            value={draftValue as string}
          >
            <option key="none" value={undefined} />
            {resourceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
        break;
      }
      InputElement = (
        <input
          className="PropertyInput__input PropertyInput__input--text"
          id={name}
          onBlur={submit}
          onChange={(e) => setDraftValue(e.target.value.replace(/ /g, ""))}
          required={required}
          type="text"
          value={draftValue as string}
        />
      );
      break;
    case "number":
      let min, max;
      if (property.rate) {
        min = 0;
        max = 1;
      }
      InputElement = (
        <input
          className="PropertyInput__input PropertyInput__input--number"
          id={name}
          max={max}
          min={min}
          onBlur={submit}
          onChange={(e) => setDraftValue(e.target.value)}
          required={required}
          step={property.rate ? 0.05 : 1}
          type="number"
          value={draftValue as number}
        />
      );
      break;
    case "boolean":
      InputElement = (
        <input
          checked={draftValue === true || draftValue === "true"}
          className="PropertyInput__input PropertyInput__input--boolean"
          id={name}
          onChange={(e) => {
            const newValue = e.target.checked ? true : false;
            updateProperty(newValue);
            /** @todo fix state/rendering logic so this isn't required */
            setDraftValue(newValue);
          }}
          required={required}
          type="checkbox"
        />
      );
      break;
    case "object":
    case "code":
      InputElement = (
        <textarea
          className="PropertyInput__input PropertyInput__input--text"
          id={name}
          onBlur={submit}
          onChange={(e) => setDraftValue(e.target.value)}
          required={required}
          value={draftValue as string}
        />
      );
  }

  return (
    <form className={`PropertyInput PropertyInput--${type}`} onSubmit={submit}>
      <label className="PropertyInput__label" htmlFor={name}>
        {name}
        {required && <span style={{ fontSize: "13px" }}> *</span>}
        <Tooltip text={description} />
      </label>
      {InputElement}
    </form>
  );
};
