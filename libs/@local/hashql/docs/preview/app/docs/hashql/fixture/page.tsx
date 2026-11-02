import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "@fumadocs/base-ui/layouts/docs/page";
import defaultMdxComponents from "@fumadocs/base-ui/mdx";

import { Body } from "../../../../../lib/components.js";
import { components } from "../../../../components/api.js";
import { body, description, title } from "../../../../fixture/ident.js";

import type { ReactNode } from "react";

// The hand-written `JExpr.Ident` page, drawn with the preview's components
// until the extraction writes real pages.
export default function Page(): ReactNode {
  return (
    <DocsPage>
      <DocsTitle>{title}</DocsTitle>
      <DocsDescription>{description}</DocsDescription>
      <DocsBody>
        <Body tree={body} components={components} html={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}
