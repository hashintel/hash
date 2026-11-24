// oxlint-disable import/max-dependencies -- a page draws either a hand-written body or a generated one, with the rail a generated module has beside it
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "@fumadocs/base-ui/layouts/docs/page";
import defaultMdxComponents from "@fumadocs/base-ui/mdx";
import { notFound } from "next/navigation.js";

import { Body } from "../../../../../src/components.js";
import { components, html } from "../../../../components/api.js";
import { Glyph } from "../../../../components/glyph.js";
import { Rail } from "../../../../components/rail.js";
import { source } from "../../../../lib/source.js";

import type * as Source from "../../../../../src/Source.js";
import type { TOCItemType } from "fumadocs-core/toc";
import type { Root, RootContent } from "hast";
import type { Metadata } from "next";
import type { ReactNode } from "react";

interface Props {
  params: Promise<{ slug?: string[] }>;
}

/** An entry's own name in the outline, which leaves out the namespaces it is in. */
const ownNameOf = (title: ReactNode): ReactNode => {
  if (typeof title !== "string") {
    return title;
  }

  return title.split(".").at(-1);
};

/** The outline, with each entry's glyph and its own name in monospace, as the page draws them, and each group's title. */
const outlineOf = (entries: readonly Source.OutlineEntry[]): TOCItemType[] =>
  entries.map(({ title, url, depth, kind }) => {
    if (kind === undefined) {
      return {
        url,
        depth,
        title: <span className="api-toc-group">{title}</span>,
      };
    }

    return {
      url,
      depth,
      title: (
        <span className="api-toc-entry">
          <Glyph kind={kind} />
          {ownNameOf(title)}
        </span>
      ),
    };
  });

/** Whether a node is a module's index, which the rail draws again beside the page. */
const isIndex = (node: RootContent): boolean =>
  node.type === "element" && node.tagName === "api-contents";

export default async function Page({ params }: Props): Promise<ReactNode> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page === undefined) {
    notFound();
  }

  const { data } = page;
  if (!("hast" in data)) {
    return (
      <DocsPage toc={data.toc}>
        <DocsTitle>{data.title}</DocsTitle>
        <DocsDescription>{data.description}</DocsDescription>
        <DocsBody>
          <data.body components={defaultMdxComponents} />
        </DocsBody>
      </DocsPage>
    );
  }

  // oxlint-disable-next-line react-perf/jsx-no-new-function-as-prop -- rendered once, on the server
  const resolve = (href: string): string => source.resolveHref(href, page);
  // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- rendered once, on the server
  const index: Root = {
    type: "root",
    children: data.hast.children.filter(isIndex),
  };
  // A page with an index draws it in the rail in place of the outline, and gives its entries the width they need to draw two columns.
  const hasIndex = index.children.length > 0;
  // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- rendered once, on the server
  const tableOfContent = hasIndex
    ? {
        enabled: true,
        component: (
          <Rail>
            <Body
              tree={index}
              components={components}
              html={html}
              resolve={resolve}
            />
          </Rail>
        ),
      }
    : { enabled: true };

  return (
    <DocsPage
      toc={outlineOf(data.toc)}
      full={hasIndex}
      tableOfContent={tableOfContent}
    >
      <DocsTitle>{data.title}</DocsTitle>
      <DocsBody>
        <Body
          tree={data.hast}
          components={components}
          html={html}
          resolve={resolve}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams(): { slug: string[] }[] {
  return source.generateParams();
}

// The build prerenders every page, and any other path is a 404.
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page === undefined) {
    notFound();
  }

  return { title: page.data.title, description: page.data.description };
}
