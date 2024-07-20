import React, type { FunctionComponent } from "react";
 
import React, { useLayoutEffect, useRef, useState } from "react";
import { createComponent } from "@lit-labs/react";

import type { CustomElementDefinition } from "../util";

type CustomElementLoaderProps = {
  properties: Record<string, unknown>;
} & CustomElementDefinition;

/**
 * Registers (if not already registered) and loads a custom element.
 */
export const CustomElementLoader: FunctionComponent<
  CustomElementLoaderProps
> = ({ elementClass, properties, tagName }) => {
  const [CustomElement, setCustomElement] = useState<FunctionComponent | null>(
    null,
  );
  const existingDefinitionRef = useRef<CustomElementDefinition | null>(null);

  useLayoutEffect(() => {
    if (
      existingDefinitionRef.current?.elementClass === elementClass &&
      existingDefinitionRef.current.tagName === tagName
    ) {
      return;
    }
    let existingCustomElement = customElements.get(tagName);

    if (!existingCustomElement) {
      try {
        customElements.define(tagName, elementClass);
      } catch (error) {
         
        console.error(
          `Error defining custom element: ${(error as Error).message}`,
        );
        throw error;
      }
    } else if (existingCustomElement !== elementClass) {
      /**
       * If an element with a different constructor is already registered with this name,
       * give this element a different name.
       * This may break elements that rely on being defined with a specific name.
       */
      let i = 0;

      do {
        existingCustomElement = customElements.get(`${tagName}${i}`);
        i++;
      } while (existingCustomElement);
      try {
        customElements.define(`${tagName}${i}`, elementClass);
      } catch (error) {
         
        console.error(
          `Error defining custom element: ${(error as Error).message}`,
        );
        throw error;
      }
    }

    existingDefinitionRef.current = { tagName, elementClass };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCustomElement(createComponent(React, tagName, elementClass) as any); // @todo fix this
  }, [elementClass, tagName]);

  return CustomElement ? <CustomElement {...properties} /> : null;
};
