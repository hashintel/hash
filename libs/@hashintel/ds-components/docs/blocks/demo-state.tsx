import { Children, cloneElement, useState } from "react";

/**
 * Makes a controlled docs example interactive: holds the tracked prop in
 * local state seeded from the prop as written in the MDX, and rebinds the
 * change handler to update it. Tag usages with `data-harness` so the Stage
 * Code tab splices in the child exactly as authored, noop handler included.
 *
 * Wraps exactly one element. `prop`/`handler` default to the shared
 * controlled-input pair (`value`/`onChange`); pass them for components
 * tracked through another pair (e.g. `open`/`onClose`). Examples whose state
 * spans several elements or props (select-all checkboxes, whole forms)
 * belong in a local demo component with a Stage `code` override instead.
 */
export const DemoState = ({
  children,
  prop = "value",
  handler = "onChange",
}: {
  children: React.ReactElement<Record<string, unknown>>;
  prop?: string;
  handler?: string;
}) => {
  const child = Children.only(children);
  const [value, setValue] = useState(child.props[prop]);
  return cloneElement(child, {
    [prop]: value,
    [handler]: (next: unknown) => {
      setValue(next);
    },
  });
};
