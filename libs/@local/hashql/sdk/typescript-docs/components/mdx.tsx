import { Popup, PopupContent } from "fumadocs-twoslash/ui";
import defaultComponents from "fumadocs-ui/mdx";

import { ReferenceTrigger } from "./reference-trigger";

import type { MDXComponents } from "mdx/types";

export const getMDXComponents = (
  components?: MDXComponents,
): MDXComponents => ({
  ...defaultComponents,
  Popup,
  PopupContent,
  PopupTrigger: ReferenceTrigger,
  ...components,
});
