import { Accordion, Accordions } from "@fumadocs/base-ui/components/accordion";
import { Tab, Tabs } from "@fumadocs/base-ui/components/tabs";
import defaultMdxComponents from "@fumadocs/base-ui/mdx";
import { Struct } from "effect";

import { MdxCallout } from "./mdx-callout.js";
import { Mermaid } from "./mermaid.js";
import { Result } from "./result.js";
import { SideBySide } from "./side-by-side.js";

/** The preview's components for hand-written MDX pages. */
export const components = Struct.assign(defaultMdxComponents, {
  Accordion,
  Accordions,
  Callout: MdxCallout,
  Mermaid,
  Result,
  SideBySide,
  Tab,
  Tabs,
});
