import { Popup, PopupContent } from "fumadocs-twoslash/ui";
import defaultComponents from "fumadocs-ui/mdx";

import { IndexEntry } from "./index-entry";
import { ReferenceTrigger } from "./reference-trigger";

import type { MDXComponents } from "mdx/types";

export const getMDXComponents = (
  components?: MDXComponents,
): MDXComponents => ({
  ...defaultComponents,
  IndexEntry,
  Popup,
  PopupContent,
  PopupTrigger: ReferenceTrigger,
  ...components,
});
