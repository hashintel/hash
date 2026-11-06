import { Accordion, Accordions } from "@fumadocs/base-ui/components/accordion";
import defaultMdxComponents from "@fumadocs/base-ui/mdx";
import { Struct } from "effect";

import { MdxCallout } from "./mdx-callout.js";

/** The preview's components for hand-written MDX pages. */
export const components = Struct.assign(defaultMdxComponents, {
  Accordion,
  Accordions,
  Callout: MdxCallout,
});
