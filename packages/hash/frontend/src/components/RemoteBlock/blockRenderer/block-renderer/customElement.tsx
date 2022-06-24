import { createComponent } from "@lit-labs/react";
import React, { useMemo, VFC } from "react";

type CustomElementLoaderProps = {
  elementClass: typeof HTMLElement;
  properties: Record<string, unknown>;
  tagName: string;
};

/**
 * Registers (if not already registered) and loads a custom element.
 */
export const CustomElementLoader: VFC<CustomElementLoaderProps> = ({
  elementClass,
  properties,
  tagName,
}) => {
  /**
   * Register the element with the CustomElementsRegistry, if not already registered.
   */
  let existingCustomElement = customElements.get(tagName);
  if (!existingCustomElement) {
    try {
      customElements.define(tagName, elementClass);
    } catch (err) {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error(`Error defining custom element: ${(err as Error).message}`);
      throw err;
    }
  } else if (existingCustomElement !== elementClass) {
    /**
     * If an element with a different constructor is already registered with this name,
     * give this element a different name.
     * This may break elements that rely on being defined with a specific name.
     */
    let i = 0;
    do {
      existingCustomElement = customElements.get(tagName);
      i++;
    } while (existingCustomElement);
    try {
      customElements.define(`${tagName}${i}`, elementClass);
    } catch (err) {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error(`Error defining custom element: ${(err as Error).message}`);
      throw err;
    }
  }

  const CustomElement = useMemo(
    () => createComponent(React, tagName, elementClass),
    [elementClass, tagName],
  );

  return <CustomElement {...properties} />;
};
